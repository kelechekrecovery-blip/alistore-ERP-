import { Injectable, Optional } from '@nestjs/common';
import { Prisma, type Payment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { UnitsService } from '../units/units.service';
import { ConflictError, ValidationError } from '../common/errors';
import { assertTransition } from '../orders/order-state-machine';
import { OrdersService } from '../orders/orders.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { GiftcardsService, normalizeCode } from '../giftcards/giftcards.service';
import { PayDto, VoidPaymentDto } from './payments.dto';
import { CampaignAttributionService } from '../campaigns/campaign-attribution.service';
import { OutboxService } from '../outbox/outbox.service';
import { enqueueConsentedCustomerNotice } from '../outbox/customer-notifications';
import { paymentAccountCode, postPaymentEntryOnTx } from '../finance/accounting-journal';
import { cumulativeTaxDelta, outputTaxMetadata } from '../finance/sales-tax';
import {
  assertOrderReservationCoverageOnTx,
  finalizeOrderInventorySaleOnTx,
  orderHasTrackedInventoryOnTx,
} from '../inventory/order-inventory-sale';

/** Order statuses from which a payment may complete (must hold a live reservation). */
const PAYABLE_STATUSES = new Set(['reserved', 'awaiting_payment']);
const PROVIDER_TENDERS = new Set<PayDto['method']>(['card', 'qr_mbank', 'qr_odengi', 'bakai_pos', 'obank', 'installment']);

interface PaymentTender {
  method: PayDto['method'];
  amount: number;
  txnId?: string;
  idempotencyKey?: string;
  giftCardCode?: string;
}

interface PaymentContext {
  staffId?: string;
  idempotencyKey?: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly units: UnitsService,
    private readonly approvals: ApprovalsService,
    @Optional() private readonly giftcards?: GiftcardsService,
    @Optional() private readonly orders?: OrdersService,
    @Optional() private readonly campaignAttribution?: CampaignAttributionService,
    @Optional() private readonly outbox?: OutboxService,
  ) {}

  get(id: string) {
    return this.prisma.payment.findUnique({ where: { id } });
  }

  async voidPending(paymentId: string, reason: VoidPaymentDto['reason'], actor: string, idempotencyKey: string) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new ValidationError('void_reason_required', 'Причина отмены платежа обязательна');
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) throw new ValidationError('payment_not_found', `Платёж ${paymentId} не найден`);
      const keyOwner = await tx.payment.findUnique({ where: { idempotencyKey } });
      if (keyOwner && keyOwner.id !== paymentId) {
        throw new ConflictError('idempotency_key_reused', 'Ключ уже использован для другого платежа');
      }
      if (payment.idempotencyKey && payment.idempotencyKey === idempotencyKey && payment.status === 'voided') {
        return { result: payment, events: [] };
      }
      if (payment.status !== 'pending') {
        throw new ConflictError('payment_not_voidable', 'Отменить можно только незавершённый pending-платёж');
      }
      if (payment.amount <= 0 || payment.originalPaymentId || payment.accountingEntryId) {
        throw new ConflictError('payment_not_voidable', 'Платёж уже имеет финансовое проведение и не может быть voided');
      }
      const existing = await tx.auditEvent.findFirst({
        where: { type: EventType.PaymentVoided, refs: { has: paymentId }, payload: { path: ['idempotencyKey'], equals: idempotencyKey } },
      });
      if (existing) return { result: payment, events: [] };
      const voided = await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'voided', idempotencyKey },
      });
      return {
        result: voided,
        events: [{
          type: EventType.PaymentVoided,
          actor,
          payload: { paymentId, orderId: payment.orderId, amount: payment.amount, reason: normalizedReason, idempotencyKey },
          refs: [paymentId, payment.orderId].filter((ref): ref is string => Boolean(ref)),
        }],
      };
    });
  }

  /**
   * Request a refund — approval-gated (Approval Rules Matrix: refund любой →
   * Администратор). Enforces invariant #1: refund needs an existing positive
   * payment and amount ≤ it. Returns an approvalId; money moves only on approve.
   */
  async refund(
    paymentId: string,
    amount: number,
    reason: string,
    requester: string,
    returnId?: string,
    settlement: {
      shiftId?: string;
      externalReference?: string;
      allocations?: Array<{ paymentId: string; amount: number; shiftId?: string; externalReference?: string }>;
    } = {},
  ) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new ValidationError('payment_not_found', `Платёж ${paymentId} не найден`);
    }
    if (payment.amount <= 0) {
      throw new ConflictError('not_refundable', 'Нельзя вернуть по возвратному платежу');
    }
    if (amount <= 0) {
      throw new ValidationError(
        'invalid_refund_amount',
        'Сумма возврата должна быть больше 0',
      );
    }
    if (!settlement.allocations?.length && amount > payment.amount) {
      throw new ValidationError(
        'invalid_refund_amount',
        `Сумма возврата должна быть 0 < amount ≤ ${payment.amount}`,
      );
    }
    const allocations = settlement.allocations?.length
      ? settlement.allocations.map((allocation) => ({
          paymentId: allocation.paymentId.trim(),
          amount: allocation.amount,
          shiftId: allocation.shiftId?.trim() || null,
          externalReference: allocation.externalReference?.trim() || null,
        }))
      : [{
          paymentId: payment.id,
          amount,
          shiftId: settlement.shiftId?.trim() || null,
          externalReference: settlement.externalReference?.trim() || null,
        }];
    if (new Set(allocations.map((allocation) => allocation.paymentId)).size !== allocations.length) {
      throw new ValidationError('duplicate_refund_tender', 'Исходный платёж нельзя указать в возврате дважды');
    }
    if (!allocations.some((allocation) => allocation.paymentId === payment.id)) {
      throw new ValidationError('refund_anchor_missing', 'Аллокации должны включать платёж из URL');
    }
    if (allocations.some((allocation) => !allocation.paymentId || !Number.isInteger(allocation.amount) || allocation.amount <= 0)) {
      throw new ValidationError('invalid_refund_allocation', 'Каждая аллокация возврата должна иметь платёж и положительную целую сумму');
    }
    if (allocations.reduce((sum, allocation) => sum + allocation.amount, 0) !== amount) {
      throw new ValidationError('refund_allocation_total_mismatch', 'Сумма аллокаций не совпадает с общей суммой возврата');
    }
    const originals = await this.prisma.payment.findMany({ where: { id: { in: allocations.map((allocation) => allocation.paymentId) } } });
    if (originals.length !== allocations.length || originals.some((original) => original.amount <= 0)) {
      throw new ValidationError('refund_allocation_payment_invalid', 'Все аллокации должны ссылаться на существующие положительные платежи');
    }
    const target = `${payment.orderId ?? ''}:${payment.serviceWorkOrderId ?? ''}`;
    if (originals.some((original) => `${original.orderId ?? ''}:${original.serviceWorkOrderId ?? ''}` !== target)) {
      throw new ConflictError('refund_allocation_target_mismatch', 'Все платежи возврата должны относиться к одному документу');
    }
    const originalById = new Map(originals.map((original) => [original.id, original]));
    for (const allocation of allocations) {
      const original = originalById.get(allocation.paymentId)!;
      const prior = await this.prisma.payment.aggregate({
        where: { originalPaymentId: original.id },
        _sum: { amount: true },
      });
      if (allocation.amount > original.amount + (prior._sum.amount ?? 0)) {
        throw new ValidationError('refund_exceeds_tender', `Возврат превышает остаток платежа ${original.id}`);
      }
    }
    if (returnId) {
      const ret = await this.prisma.return.findUnique({ where: { id: returnId } });
      if (!ret) throw new ValidationError('return_not_found', `Возврат ${returnId} не найден`);
      if (!payment.orderId || ret.orderId !== payment.orderId) {
        throw new ConflictError('refund_return_order_mismatch', 'Возврат и платёж относятся к разным заказам');
      }
      if (ret.status !== 'processing') {
        throw new ConflictError(
          'return_not_processing',
          `Refund можно запросить только для возврата processing (сейчас ${ret.status})`,
        );
      }
      if (amount !== ret.refundAmount) {
        throw new ValidationError(
          'refund_return_amount_mismatch',
          `Сумма refund должна совпадать с расчётом возврата: ${ret.refundAmount}`,
        );
      }
    }
    return this.approvals.request({
      action: 'refund',
      requester,
      reason,
      payload: {
        paymentId,
        amount,
        returnId: returnId ?? null,
        shiftId: settlement.shiftId?.trim() || null,
        externalReference: settlement.externalReference?.trim() || null,
        cashierStaffId: requester,
        allocations,
      },
    });
  }

  find(where: { orderId?: string; shiftId?: string }) {
    return this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  findByTxnId(txnId: string) {
    return this.prisma.payment.findUnique({ where: { txnId } });
  }

  async payForCustomer(customerId: string, dto: PayDto, actor: string) {
    const order = await this.prisma.order.findFirst({ where: { id: dto.orderId, customerId }, select: { id: true } });
    if (!order) {
      throw new ValidationError('order_not_found', `Заказ ${dto.orderId} не найден`);
    }
    return this.pay(dto, actor);
  }

  async pay(dto: PayDto, actor: string, context: PaymentContext = {}) {
    const idempotencyKey = context.idempotencyKey?.trim() || dto.txnId?.trim();
    // Provider transaction ids and staff idempotency keys both replay the exact
    // original movement. Changed reuse is rejected instead of returning a false success.
    if (idempotencyKey) {
      const existing = await this.prisma.payment.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        this.assertPaymentReplay(existing, dto, dto.orderId);
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
        payments: [
          {
            method: dto.method,
            amount: dto.amount,
            txnId: dto.txnId,
            idempotencyKey,
            giftCardCode: dto.giftCardCode,
          },
        ],
      },
      actor,
      context,
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
    context: PaymentContext = {},
  ) {
    const tenders = dto.payments.map((payment) => {
      const normalized = this.normalizeTender(payment, dto.orderId);
      return { ...normalized, idempotencyKey: normalized.idempotencyKey?.trim() || normalized.txnId?.trim() };
    });
    if (tenders.length === 0) {
      throw new ValidationError('payment_required', 'Нужен хотя бы один платёж');
    }
    const invalid = tenders.find((payment) => payment.amount <= 0);
    if (invalid) {
      throw new ValidationError('invalid_payment_amount', 'Сумма платежа должна быть больше 0');
    }
    const missingGiftCard = tenders.find((payment) => payment.method === 'gift_card' && !payment.giftCardCode);
    if (missingGiftCard) {
      throw new ValidationError('giftcard_code_required', 'Для оплаты подарочной картой нужен код');
    }
    const missingIdempotency = tenders.find((payment) => !payment.idempotencyKey);
    if (missingIdempotency) {
      throw new ValidationError('payment_idempotency_required', 'Для каждого платежа нужен постоянный Idempotency-Key');
    }
    const missingProviderTxn = tenders.find((payment) => PROVIDER_TENDERS.has(payment.method) && !payment.txnId?.trim());
    if (missingProviderTxn) {
      throw new ValidationError('payment_provider_txn_required', 'Электронный платёж требует provider txnId для сверки и возврата');
    }
    const idempotencyKeys = tenders.map((payment) => payment.idempotencyKey as string);
    if (new Set(idempotencyKeys).size !== idempotencyKeys.length) {
      throw new ValidationError('duplicate_payment_idempotency', 'Idempotency-Key платежей не должны повторяться');
    }
    const txnIds = tenders.map((payment) => payment.txnId).filter((id): id is string => Boolean(id));
    if (new Set(txnIds).size !== txnIds.length) throw new ValidationError('duplicate_payment_txn', 'txnId платежей не должны повторяться');

    // Split retries dedupe by the first command key; the batch transaction is all-or-nothing.
    if (idempotencyKeys[0]) {
      const existing = await this.prisma.payment.findUnique({
        where: { idempotencyKey: idempotencyKeys[0] },
      });
      if (existing) {
        this.assertPaymentReplay(existing, tenders[0], dto.orderId);
        const [order, payments] = await Promise.all([
          this.prisma.order.findUnique({ where: { id: existing.orderId ?? dto.orderId } }),
          this.prisma.payment.findMany({
            where: { idempotencyKey: { in: idempotencyKeys } },
            orderBy: { createdAt: 'asc' },
          }),
        ]);
        return { order, payment: existing, payments, idempotent: true };
      }
    }

    if (tenders.some((payment) => payment.method === 'gift_card') && this.orders) {
      const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
      if (order?.status === 'created' || order?.status === 'confirmed') {
        await this.orders.fulfill(order.id, actor);
      }
    }

    return this.audit.transaction(async (tx) => {
      // Serialize concurrent payments on the same order — accessory-only orders have no
      // IMEI unit for sellOnTx to lock, so without this two full payments could race,
      // both create Payment rows and both flip the order to paid. Row-lock first (mirror
      // the refund executor); the loser re-reads status=paid and hits the guard below.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${dto.orderId} FOR UPDATE`;

      const order = await tx.order.findUnique({
        where: { id: dto.orderId },
        include: { items: true, storePoint: { select: { inventoryLocation: true } } },
      });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${dto.orderId} не найден`);
      }
      if (order.isDemo) {
        throw new ConflictError(
          'demo_payment_forbidden',
          `Демо-заказ ${order.id} не создаёт платёж и не меняет остатки`,
        );
      }

      // Invariant: no paid without an active reservation.
      if (!PAYABLE_STATUSES.has(order.status)) {
        throw new ConflictError(
          'payment_without_reservation',
          `Заказ ${order.id} нельзя оплатить без резерва (статус: ${order.status})`,
        );
      }

      let point = order.fulfillmentLocation?.trim() || order.storePoint?.inventoryLocation.trim();
      if (!point) {
        const imeis = order.items.map((item) => item.imei).filter((imei): imei is string => Boolean(imei));
        if (imeis.length > 0) {
          const locations = await tx.deviceUnit.findMany({
            where: { imei: { in: imeis } },
            select: { location: true },
            distinct: ['location'],
          });
          if (locations.length === 1) point = locations[0].location.trim();
        }
      }
      if (!point) {
        throw new ValidationError('payment_point_required', 'У заказа должна быть определена точка исполнения');
      }
      const received = await tx.payment.aggregate({
        where: { orderId: order.id, amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } },
        _sum: { amount: true },
      });
      const alreadyReceived = received._sum.amount ?? 0;
      const batchTotal = tenders.reduce((sum, payment) => sum + payment.amount, 0);
      if (alreadyReceived + batchTotal > order.total) {
        throw new ValidationError('payment_exceeds_order_total', 'Сумма платежей превышает итог заказа');
      }
      const cashShift = tenders.some((payment) => payment.method === 'cash')
        ? await this.resolveCashShiftOnTx(tx, dto.shiftId, context.staffId, point)
        : null;
      const events: AuditInput[] = [];
      const payments: Payment[] = [];
      const taxMetadata = outputTaxMetadata(order.items);
      let processedAmount = alreadyReceived;
      for (const tender of tenders) {
        let redeemedGiftCard = null;
        if (tender.method === 'gift_card') {
          if (!this.giftcards || !tender.giftCardCode) {
            throw new ValidationError('giftcard_unavailable', 'Gift-card сервис недоступен');
          }
          redeemedGiftCard = await this.giftcards.redeemOnTx(
            tx,
            tender.giftCardCode,
            order.id,
            tender.amount,
            actor,
            events,
          );
        }
        const payment = await tx.payment.create({
          data: {
            orderId: order.id,
            amount: tender.amount,
            method: tender.method,
            status: 'received',
            txnId: tender.txnId,
            shiftId: tender.method === 'cash' ? cashShift?.id : null,
            accountCode: paymentAccountCode(tender.method),
            idempotencyKey: tender.idempotencyKey,
            receivedBy: actor,
            point,
            giftCardId: redeemedGiftCard?.id,
          },
        });
        if (redeemedGiftCard) {
          await tx.giftCardTransaction.create({
            data: {
              giftCardId: redeemedGiftCard.id,
              paymentId: payment.id,
              type: 'redemption',
              amount: -tender.amount,
              balanceAfter: redeemedGiftCard.balance,
              sourceRef: `giftcard:payment:${payment.id}`,
              actor,
            },
          });
        }
        const accountingEntry = await postPaymentEntryOnTx(tx, {
          payment,
          idempotencyKey: tender.idempotencyKey as string,
          point,
          actor,
          tax: {
            ...taxMetadata,
            taxAmount: cumulativeTaxDelta(order.taxAmount, order.total, processedAmount, tender.amount),
          },
        });
        processedAmount += tender.amount;
        const postedPayment = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        payments.push(postedPayment);
        events.push({
          type: EventType.PaymentReceived,
          actor,
          payload: {
            orderId: order.id,
            amount: tender.amount,
            method: tender.method,
            point,
            accountCode: postedPayment.accountCode,
            shiftId: postedPayment.shiftId,
            accountingEntryId: accountingEntry.id,
            taxAmount: accountingEntry.taxAmount,
          },
          refs: [order.id, payment.id],
        });
        events.push({
          type: EventType.AccountingEntryPosted,
          actor,
          payload: { accountingEntryId: accountingEntry.id, sourceType: 'payment.receipt', sourceRef: payment.id },
          refs: [accountingEntry.id, payment.id, order.id],
        });
      }

      if (alreadyReceived + batchTotal < order.total) {
        return { result: { order, payment: payments[0], payments, idempotent: false }, events };
      }

      if (await orderHasTrackedInventoryOnTx(tx, order.id)) {
        await assertOrderReservationCoverageOnTx(tx, order.id);
      }
      await finalizeOrderInventorySaleOnTx(tx, {
        orderId: order.id,
        actor,
        units: this.units,
        events,
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
      await this.campaignAttribution?.convertPaidOrderOnTx(tx, order.id, actor, events);
      if (this.outbox) {
        await enqueueConsentedCustomerNotice(tx, this.outbox, {
          customerId: order.customerId,
          template: 'payment_received',
          payload: { orderId: order.id, amount: batchTotal, total: order.total },
          transactional: true,
        });
      }

      return { result: { order: paid, payment: payments[0], payments, idempotent: false }, events };
    });
  }

  private normalizeTender(payment: PaymentTender, orderId: string): PaymentTender {
    if (payment.method !== 'gift_card' || !payment.giftCardCode || payment.txnId) {
      return payment;
    }
    const code = normalizeCode(payment.giftCardCode);
    const key = `giftcard:${code}:${orderId}`;
    return { ...payment, giftCardCode: code, txnId: key, idempotencyKey: key };
  }

  private assertPaymentReplay(existing: Payment, tender: Pick<PaymentTender, 'method' | 'amount' | 'txnId'>, orderId: string) {
    if (
      existing.orderId !== orderId ||
      existing.method !== tender.method ||
      existing.amount !== tender.amount ||
      (tender.txnId && existing.txnId !== tender.txnId)
    ) {
      throw new ConflictError('payment_idempotency_conflict', 'Idempotency-Key уже использован для другого платежа');
    }
  }

  private async resolveCashShiftOnTx(
    tx: Prisma.TransactionClient,
    requestedShiftId: string | undefined,
    staffId: string | undefined,
    point: string,
  ) {
    if (!staffId) {
      throw new ValidationError('cash_staff_required', 'Наличные принимает только авторизованный сотрудник');
    }
    const candidate = requestedShiftId
      ? await tx.cashShift.findUnique({ where: { id: requestedShiftId }, select: { id: true } })
      : await tx.cashShift.findFirst({ where: { staffId, closedAt: null }, select: { id: true }, orderBy: { openedAt: 'desc' } });
    if (!candidate) throw new ConflictError('cash_shift_required', 'Для наличного платежа нужна открытая кассовая смена');
    await tx.$queryRaw`SELECT id FROM "CashShift" WHERE id = ${candidate.id} FOR UPDATE`;
    const shift = await tx.cashShift.findUnique({ where: { id: candidate.id } });
    if (!shift) throw new ConflictError('cash_shift_required', 'Кассовая смена не найдена');
    if (shift.staffId !== staffId) throw new ConflictError('cash_shift_foreign', 'Кассовая смена принадлежит другому сотруднику');
    if (shift.closedAt) throw new ConflictError('cash_shift_closed', 'Нельзя добавить платёж в закрытую кассовую смену');
    if (shift.point !== point) throw new ConflictError('cash_shift_wrong_point', 'Кассовая смена открыта в другой точке');
    return shift;
  }
}
