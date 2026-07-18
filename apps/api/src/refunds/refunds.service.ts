import { Injectable, Optional } from '@nestjs/common';
import { Payment, PaymentMethod, Prisma, RefundStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { cumulativeTaxDelta } from '../finance/sales-tax';
import { OutboxService } from '../outbox/outbox.service';
import { enqueueStaffNotice } from '../outbox/customer-notifications';
import { PrismaService } from '../prisma/prisma.service';
import { CancelRefundDto, CreateRefundDto } from './refunds.dto';

const ACTIVE_RESERVATION_STATUSES: RefundStatus[] = [
  'requested', 'approved', 'processing', 'partially_succeeded', 'failed',
];

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly outbox?: OutboxService,
  ) {}

  get(id: string) {
    return this.prisma.refund.findUnique({
      where: { id },
      include: {
        return: { include: { items: true } },
        approval: true,
        lines: { include: { returnItem: true }, orderBy: { createdAt: 'asc' } },
        allocations: { include: { originalPayment: true, refundPayment: true }, orderBy: { ordinal: 'asc' } },
      },
    });
  }

  async request(returnId: string, dto: CreateRefundDto, actor: string, idempotencyKey: string) {
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ returnId, reason: dto.reason.trim(), shiftId: dto.shiftId ?? null }))
      .digest('hex');
    const refundId = randomUUID();
    const created = await this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'refund:' + idempotencyKey}))::text AS locked`;
      const replay = await tx.refund.findUnique({ where: { idempotencyKey } });
      if (replay) {
        if (replay.requestHash !== requestHash) throw new ConflictError('idempotency_key_reused', 'Ключ уже использован с другим запросом');
        return { result: replay, events: [] };
      }
      await tx.$queryRaw`SELECT id FROM "Return" WHERE id = ${returnId} FOR UPDATE`;
      const ret = await tx.return.findUnique({
        where: { id: returnId },
        include: { items: { include: { orderItem: true } }, order: true },
      });
      if (!ret) throw new ValidationError('return_not_found', 'Возврат не найден');
      if (ret.status !== 'processing') throw new ConflictError('return_not_processing', `Возврат уже ${ret.status}`);
      if (ret.refundAmount <= 0 || ret.items.length === 0) throw new ValidationError('refund_amount_invalid', 'В возврате нет оплачиваемых строк');
      const existing = await tx.refund.findUnique({ where: { returnId } });
      if (existing) throw new ConflictError('return_refund_exists', 'Для возврата уже создан refund');

      const payments = await tx.payment.findMany({
        where: { orderId: ret.orderId, amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      for (const payment of payments) {
        await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;
      }
      const allocations = await this.allocateOnTx(tx, payments, ret.refundAmount);
      const cashAllocation = allocations.find((item) => item.payment.method === 'cash');
      if (cashAllocation) await this.assertCashShift(tx, dto.shiftId, actor, cashAllocation.payment);

      const approval = await tx.approval.create({
        data: {
          action: 'refund', requester: actor, reason: dto.reason.trim(), status: 'requested',
          evidence: { payload: { refundId }, evidence: { returnId, amount: ret.refundAmount } },
        },
      });
      const postedRefundPayments = await tx.payment.findMany({
        where: { orderId: ret.orderId, amount: { lt: 0 } },
        select: { id: true },
      });
      const postedTax = postedRefundPayments.length === 0
        ? 0
        : (await tx.accountingJournalEntry.aggregate({
          where: {
            sourceType: 'payment.refund',
            sourceRef: { in: postedRefundPayments.map(({ id }) => id) },
          },
          _sum: { taxAmount: true },
        }))._sum.taxAmount ?? 0;
      let remainingTaxBudget = Math.max(ret.order.taxAmount - postedTax, 0);
      const lines = [];
      const orderedItems = [...ret.items].sort((left, right) =>
        left.orderItemId.localeCompare(right.orderItemId) || left.id.localeCompare(right.id),
      );
      for (const item of orderedItems) {
        const [aggregatePrevious, legacyPrevious] = await Promise.all([
          tx.refundLine.aggregate({
            where: {
              returnItem: { orderItemId: item.orderItemId },
              refund: { status: { not: 'rejected' } },
            },
            _sum: { qty: true },
          }),
          tx.returnItem.aggregate({
            where: {
              orderItemId: item.orderItemId,
              return: { status: 'paid' },
              refundLines: { none: {} },
            },
            _sum: { qty: true },
          }),
        ]);
        const previousQty = (aggregatePrevious._sum.qty ?? 0) + (legacyPrevious._sum.qty ?? 0);
        const itemGross = item.orderItem.price * item.orderItem.qty - item.orderItem.discountAmount;
        const previousGross = Math.floor((itemGross * previousQty) / item.orderItem.qty);
        const cumulativeQty = previousQty + item.qty;
        const afterGross = cumulativeQty === item.orderItem.qty
          ? itemGross
          : Math.floor((itemGross * cumulativeQty) / item.orderItem.qty);
        const returnedGross = afterGross - previousGross;
        const itemTaxAmount = cumulativeTaxDelta(item.orderItem.taxAmount, itemGross, previousGross, returnedGross);
        const taxAmount = Math.min(itemTaxAmount, remainingTaxBudget);
        remainingTaxBudget -= taxAmount;
        lines.push({
          returnItemId: item.id,
          qty: item.qty,
          grossAmount: item.refundAmount,
          taxBaseAmount: item.refundAmount - taxAmount,
          taxAmount,
          revenueAmount: item.refundAmount - taxAmount,
          taxCode: item.orderItem.taxCode,
          taxRateBps: item.orderItem.taxRateBps,
        });
      }
      const refund = await tx.refund.create({
        data: {
          id: refundId, returnId, orderId: ret.orderId, approvalId: approval.id,
          idempotencyKey, requestHash, amount: ret.refundAmount, reason: dto.reason.trim(), requester: actor,
          lines: { create: lines },
          allocations: {
            create: allocations.map((item, ordinal) => ({
              originalPaymentId: item.payment.id,
              amount: item.amount,
              ordinal,
              methodSnapshot: item.payment.method,
              shiftId: item.payment.method === 'cash' ? dto.shiftId : null,
            })),
          },
        },
      });
      if (this.outbox) {
        await enqueueStaffNotice(tx, this.outbox, {
          template: 'approval_requested',
          title: 'Нужно согласование',
          body: `refund · ${dto.reason.trim()}`,
          payload: { approvalId: approval.id, action: 'refund', refundId, deepLink: `alistore-admin://approvals/${approval.id}` },
        });
      }
      return {
        result: refund,
        events: [
          { type: EventType.ApprovalRequested, actor, payload: { approvalId: approval.id, action: 'refund', refundId }, refs: [approval.id, refundId, returnId] },
          { type: EventType.RefundRequested, actor, payload: { refundId, returnId, orderId: ret.orderId, amount: ret.refundAmount }, refs: [refundId, returnId, ret.orderId] },
        ],
      };
    });
    return this.get(created.id);
  }

  async cancel(id: string, dto: CancelRefundDto, actor: string, idempotencyKey: string) {
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ id, reason: dto.reason.trim() }))
      .digest('hex');
    const idempotencyRef = `idempotency:${idempotencyKey}`;
    const cancelled = await this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'refund-cancel:' + idempotencyKey}))::text AS locked`;
      const replay = await tx.auditEvent.findFirst({
        where: { type: EventType.RefundCancelled, refs: { has: idempotencyRef } },
      });
      if (replay) {
        if (!replay.refs.includes(id)) throw new ConflictError('idempotency_key_reused', 'Ключ уже использован для другого возврата');
        const payload = replay.payload as Record<string, unknown>;
        if (payload.requestHash !== requestHash) {
          throw new ConflictError('idempotency_key_reused', 'Ключ уже использован с другим запросом');
        }
        return { result: await tx.refund.findUniqueOrThrow({ where: { id } }), events: [] };
      }

      await tx.$queryRaw`SELECT id FROM "Refund" WHERE id = ${id} FOR UPDATE`;
      const refund = await tx.refund.findUnique({ where: { id }, include: { allocations: true } });
      if (!refund) throw new ValidationError('refund_not_found', 'Refund не найден');
      if (refund.status !== 'failed') {
        throw new ConflictError('refund_not_cancellable', 'Отменить можно только неисполненный refund после ошибки');
      }
      if (refund.allocations.some((allocation) =>
        ['processing', 'provider_pending', 'succeeded'].includes(allocation.status))) {
        throw new ConflictError('refund_reconciliation_required', 'Есть исполняемая или подтверждённая аллокация; нужна финансовая сверка');
      }
      for (const allocation of refund.allocations) {
        if (!['card', 'qr_mbank', 'qr_odengi', 'bakai_pos', 'obank', 'installment'].includes(allocation.methodSnapshot)) continue;
        const verifiedFailure = await tx.auditEvent.findFirst({
          where: { type: EventType.RefundProviderFailed, refs: { has: allocation.id } },
          select: { id: true },
        });
        if (!verifiedFailure) {
          throw new ConflictError(
            'refund_reconciliation_required',
            'Provider refund не имеет подтверждённого terminal-failure callback',
          );
        }
      }
      await tx.refundAllocation.updateMany({
        where: { refundId: id, status: { in: ['queued', 'failed'] } },
        data: { status: 'failed', lastError: `operator_cancelled:${dto.reason.trim()}`, lockedAt: null, nextAttemptAt: null },
      });
      const result = await tx.refund.update({ where: { id }, data: { status: 'rejected' } });
      await tx.return.update({ where: { id: refund.returnId }, data: { status: 'rejected' } });
      return {
        result,
        events: [{
          type: EventType.RefundCancelled,
          actor,
          payload: { refundId: id, reason: dto.reason.trim(), requestHash },
          refs: [id, refund.returnId, refund.orderId, idempotencyRef],
        }],
      };
    });
    return this.get(cancelled.id);
  }

  private async allocateOnTx(tx: Prisma.TransactionClient, payments: Payment[], amount: number) {
    const priority: Record<PaymentMethod, number> = {
      card: 0, qr_mbank: 0, qr_odengi: 0, bakai_pos: 0, obank: 0, installment: 0, gift_card: 1, cash: 2,
    };
    const ordered = [...payments].sort((a, b) => priority[a.method] - priority[b.method] || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    let remaining = amount;
    const result: Array<{ payment: Payment; amount: number }> = [];
    for (const payment of ordered) {
      const [executed, reserved] = await Promise.all([
        tx.payment.aggregate({ where: { originalPaymentId: payment.id }, _sum: { amount: true } }),
        tx.refundAllocation.aggregate({
          where: { originalPaymentId: payment.id, status: { in: ['queued', 'processing', 'provider_pending', 'failed'] }, refund: { status: { in: ACTIVE_RESERVATION_STATUSES } } },
          _sum: { amount: true },
        }),
      ]);
      const available = payment.amount + (executed._sum.amount ?? 0) - (reserved._sum.amount ?? 0);
      const allocated = Math.min(Math.max(available, 0), remaining);
      if (allocated > 0) result.push({ payment, amount: allocated });
      remaining -= allocated;
      if (remaining === 0) break;
    }
    if (remaining > 0) throw new ValidationError('refund_exceeds_paid', 'Недостаточно доступных исходных платежей для возврата');
    return result;
  }

  private async assertCashShift(tx: Prisma.TransactionClient, shiftId: string | undefined, actor: string, payment: Payment) {
    if (!shiftId) throw new ValidationError('cash_refund_shift_required', 'Для наличного возврата нужна открытая смена инициатора');
    await tx.$queryRaw`SELECT id FROM "CashShift" WHERE id = ${shiftId} FOR UPDATE`;
    const shift = await tx.cashShift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.closedAt) throw new ConflictError('cash_refund_shift_closed', 'Смена возврата закрыта или не найдена');
    if (shift.staffId !== actor) throw new ConflictError('cash_refund_shift_foreign', 'Смена принадлежит другому сотруднику');
    if (payment.point && shift.point !== payment.point) throw new ConflictError('cash_refund_shift_wrong_point', 'Смена открыта в другой точке');
  }
}
