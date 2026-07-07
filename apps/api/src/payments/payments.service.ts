import { Injectable } from '@nestjs/common';
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

  /**
   * Take payment for an order and move it to `paid`.
   *
   * Enforces two invariants in one transaction:
   *  - «Заказ не paid без резерва» → an order that is not reserved is rejected (409).
   *  - «Нельзя продать один IMEI дважды» → reserved units are marked sold; a sold
   *    unit throws (409).
   * Webhook idempotency: a repeated txnId is a no-op returning the existing payment.
   */
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

      const events: AuditInput[] = [];
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          amount: dto.amount,
          method: dto.method,
          status: 'received',
          txnId: dto.txnId,
          shiftId: dto.shiftId,
        },
      });
      events.push({
        type: EventType.PaymentReceived,
        actor,
        payload: { orderId: order.id, amount: dto.amount, method: dto.method },
        refs: [order.id, payment.id],
      });

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

      return { result: { order: paid, payment, idempotent: false }, events };
    });
  }
}
