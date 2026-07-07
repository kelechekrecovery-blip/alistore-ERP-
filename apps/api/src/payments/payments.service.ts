import { Injectable } from '@nestjs/common';
import { type Payment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { UnitsService } from '../units/units.service';
import { ConflictError, ValidationError } from '../common/errors';
import { assertTransition } from '../orders/order-state-machine';
import { ApprovalsService } from '../approvals/approvals.service';
import { PayDto } from './payments.dto';

/** Order statuses from which a payment may complete (must hold a live reservation). */
const PAYABLE_STATUSES = new Set(['reserved', 'awaiting_payment']);

interface PaymentTender {
  method: PayDto['method'];
  amount: number;
  txnId?: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly units: UnitsService,
    private readonly approvals: ApprovalsService,
  ) {}

  /**
   * Request a refund — approval-gated (Approval Rules Matrix: refund любой →
   * Администратор). Enforces invariant #1: refund needs an existing positive
   * payment and amount ≤ it. Returns an approvalId; money moves only on approve.
   */
  async refund(paymentId: string, amount: number, reason: string, requester: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new ValidationError('payment_not_found', `Платёж ${paymentId} не найден`);
    }
    if (payment.amount <= 0) {
      throw new ConflictError('not_refundable', 'Нельзя вернуть по возвратному платежу');
    }
    if (amount <= 0 || amount > payment.amount) {
      throw new ValidationError(
        'invalid_refund_amount',
        `Сумма возврата должна быть 0 < amount ≤ ${payment.amount}`,
      );
    }
    return this.approvals.request({
      action: 'refund',
      requester,
      reason,
      payload: { paymentId, amount },
    });
  }

  find(where: { orderId?: string; shiftId?: string }) {
    return this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  findByTxnId(txnId: string) {
    return this.prisma.payment.findUnique({ where: { txnId } });
  }

  async pay(dto: PayDto, actor: string) {
    // Idempotent dedup by txnId (webhook may fire twice) — checked before the tx.
    if (dto.txnId) {
      const existing = await this.prisma.payment.findUnique({
        where: { txnId: dto.txnId },
      });
      if (existing) {
        const order = await this.prisma.order.findUnique({
          where: { id: existing.orderId ?? dto.orderId },
        });
        return { order, payment: existing, idempotent: true };
      }
    }

    const paid = await this.payMany(
      {
        orderId: dto.orderId,
        shiftId: dto.shiftId,
        payments: [{ method: dto.method, amount: dto.amount, txnId: dto.txnId }],
      },
      actor,
    );
    return { ...paid, payment: paid.payments[0] };
  }

  /**
   * Take one or more tenders for an order. The order moves to `paid` only when
   * received positive payments cover the order total; partial payments keep the
   * reservation live and never mark IMEI units sold early.
   */
  async payMany(
    dto: { orderId: string; shiftId?: string; payments: PaymentTender[] },
    actor: string,
  ) {
    if (dto.payments.length === 0) {
      throw new ValidationError('payment_required', 'Нужен хотя бы один платёж');
    }
    const invalid = dto.payments.find((payment) => payment.amount <= 0);
    if (invalid) {
      throw new ValidationError('invalid_payment_amount', 'Сумма платежа должна быть больше 0');
    }
    const txnIds = dto.payments.map((payment) => payment.txnId).filter((id): id is string => Boolean(id));
    if (new Set(txnIds).size !== txnIds.length) {
      throw new ValidationError('duplicate_payment_txn', 'txnId платежей не должны повторяться');
    }

    // Split POS retries dedupe by the first txnId; the batch transaction is all-or-nothing.
    if (txnIds[0]) {
      const existing = await this.prisma.payment.findUnique({
        where: { txnId: txnIds[0] },
      });
      if (existing) {
        const [order, payments] = await Promise.all([
          this.prisma.order.findUnique({ where: { id: existing.orderId ?? dto.orderId } }),
          this.prisma.payment.findMany({
            where: { orderId: existing.orderId ?? dto.orderId },
            orderBy: { createdAt: 'asc' },
          }),
        ]);
        return { order, payment: existing, payments, idempotent: true };
      }
    }

    return this.audit.transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: dto.orderId },
        include: { items: true },
      });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${dto.orderId} не найден`);
      }

      // Invariant: no paid without an active reservation.
      if (!PAYABLE_STATUSES.has(order.status)) {
        throw new ConflictError(
          'payment_without_reservation',
          `Заказ ${order.id} нельзя оплатить без резерва (статус: ${order.status})`,
        );
      }

      const received = await tx.payment.aggregate({
        where: { orderId: order.id, amount: { gt: 0 } },
        _sum: { amount: true },
      });
      const alreadyReceived = received._sum.amount ?? 0;
      const batchTotal = dto.payments.reduce((sum, payment) => sum + payment.amount, 0);
      const events: AuditInput[] = [];
      const payments: Payment[] = [];
      for (const tender of dto.payments) {
        const payment = await tx.payment.create({
          data: {
            orderId: order.id,
            amount: tender.amount,
            method: tender.method,
            status: 'received',
            txnId: tender.txnId,
            shiftId: dto.shiftId,
          },
        });
        payments.push(payment);
        events.push({
          type: EventType.PaymentReceived,
          actor,
          payload: { orderId: order.id, amount: tender.amount, method: tender.method },
          refs: [order.id, payment.id],
        });
      }

      if (alreadyReceived + batchTotal < order.total) {
        return { result: { order, payment: payments[0], payments, idempotent: false }, events };
      }

      // Convert every reserved IMEI unit to sold (double-sale guard lives here too).
      for (const item of order.items) {
        if (!item.imei) continue;
        await this.units.sellOnTx(tx, item.imei, order.id);
        events.push({
          type: EventType.UnitSold,
          actor,
          payload: { orderId: order.id, imei: item.imei },
          refs: [order.id, item.imei],
        });
      }

      await tx.reservation.updateMany({
        where: { orderId: order.id, active: true },
        data: { active: false },
      });

      assertTransition(order.status, 'paid');
      const paid = await tx.order.update({
        where: { id: order.id },
        data: { status: 'paid' },
      });
      events.push({
        type: EventType.OrderPaid,
        actor,
        payload: { orderId: order.id, total: order.total },
        refs: [order.id],
      });

      return { result: { order: paid, payment: payments[0], payments, idempotent: false }, events };
    });
  }
}
