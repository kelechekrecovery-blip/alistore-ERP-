import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { canTransition } from '../orders/order-state-machine';
import { insertDebt } from '../debts/debt-insert';
import { reconcileRefundLoyaltyOnTx } from '../customers/loyalty-ledger';
import { applyCampaignRefundOnTx } from '../campaigns/campaign-refund-adjustment';
import { paymentAccountCode, postAccountingEntryOnTx, postPaymentEntryOnTx } from '../finance/accounting-journal';
import { cumulativeTaxDelta, outputTaxMetadata } from '../finance/sales-tax';
import { adjustQuantityValuationOnTx } from '../inventory/inventory-valuation';

/**
 * Executors for approved dangerous actions. Each runs inside the approval's
 * transaction (with the approval.approved event), takes the parked payload, and
 * appends the resulting ledger events. Kept out of ApprovalsService so the service
 * stays small and every gated action lives in one place (Approval Rules Matrix).
 */
export type ActionExecutor = (
  tx: Prisma.TransactionClient,
  payload: Record<string, unknown>,
  approver: string,
  approvalId: string,
  events: AuditInput[],
) => Promise<void>;

export type ActionRejectionExecutor = (
  tx: Prisma.TransactionClient,
  payload: Record<string, unknown>,
  approver: string,
  approvalId: string,
  reason: string | null,
  events: AuditInput[],
) => Promise<void>;

/** campaign_budget — approve the exact budget snapshot submitted for review. */
const campaign_budget: ActionExecutor = async (tx, payload, approver, approvalId, events) => {
  const campaignId = String(payload['campaignId']);
  const budget = Number(payload['budget']);
  await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
  const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new ValidationError('campaign_not_found', 'Кампания не найдена');
  if (campaign.status !== 'review' || campaign.approvalId !== approvalId) {
    throw new ConflictError('campaign_review_changed', 'Кампания больше не ожидает это согласование');
  }
  if (campaign.budget !== budget) {
    throw new ConflictError('campaign_budget_changed', 'Бюджет изменился после отправки на согласование');
  }
  await tx.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'approved',
      approvedBy: approver,
      approvedAt: new Date(),
      updatedBy: approver,
      rejectionReason: null,
    },
  });
  events.push({
    type: EventType.CampaignApproved,
    actor: approver,
    payload: { campaignId, approvalId, budget },
    refs: [campaignId, approvalId],
  });
};

const reject_campaign_budget: ActionRejectionExecutor = async (
  tx,
  payload,
  approver,
  approvalId,
  reason,
  events,
) => {
  const campaignId = String(payload['campaignId']);
  await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
  const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new ValidationError('campaign_not_found', 'Кампания не найдена');
  if (campaign.status !== 'review' || campaign.approvalId !== approvalId) {
    throw new ConflictError('campaign_review_changed', 'Кампания больше не ожидает это согласование');
  }
  await tx.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'draft',
      rejectionReason: reason ?? 'Бюджет отклонён',
      updatedBy: approver,
    },
  });
  events.push({
    type: EventType.CampaignReviewRejected,
    actor: approver,
    payload: { campaignId, approvalId, reason },
    refs: [campaignId, approvalId],
  });
};

/** refund — one approved refund split back across its original tenders. */
const legacy_refund: ActionExecutor = async (tx, payload, approver, approvalId, events) => {
  const paymentId = String(payload['paymentId']);
  const amount = Number(payload['amount']);
  const returnId = payload['returnId'] ? String(payload['returnId']) : null;
  const cashierStaffId = payload['cashierStaffId'] ? String(payload['cashierStaffId']) : null;
  const rawAllocations = Array.isArray(payload['allocations']) ? payload['allocations'] : null;
  const allocations = rawAllocations?.map((value) => {
    const allocation = value as Record<string, unknown>;
    return {
      paymentId: String(allocation['paymentId'] ?? ''),
      amount: Number(allocation['amount']),
      shiftId: allocation['shiftId'] ? String(allocation['shiftId']) : null,
      externalReference: allocation['externalReference'] ? String(allocation['externalReference']).trim() : null,
    };
  }) ?? [{
    paymentId,
    amount,
    shiftId: payload['shiftId'] ? String(payload['shiftId']) : null,
    externalReference: payload['externalReference'] ? String(payload['externalReference']).trim() : null,
  }];
  if (
    amount <= 0 || allocations.length === 0 ||
    allocations.some((allocation) => !allocation.paymentId || !Number.isInteger(allocation.amount) || allocation.amount <= 0) ||
    allocations.reduce((sum, allocation) => sum + allocation.amount, 0) !== amount ||
    new Set(allocations.map((allocation) => allocation.paymentId)).size !== allocations.length ||
    !allocations.some((allocation) => allocation.paymentId === paymentId)
  ) {
    throw new ValidationError('invalid_refund_allocation', 'Некорректные аллокации возврата');
  }

  const paymentIds = allocations.map((allocation) => allocation.paymentId).sort();
  await tx.$queryRaw`SELECT id FROM "Payment" WHERE id IN (${Prisma.join(paymentIds)}) ORDER BY id FOR UPDATE`;
  const originals = await tx.payment.findMany({ where: { id: { in: paymentIds } } });
  if (originals.length !== allocations.length || originals.some((original) => original.amount <= 0)) {
    throw new ValidationError('payment_not_found', 'Один из исходных платежей возврата не найден');
  }
  const originalById = new Map(originals.map((original) => [original.id, original]));
  const anchor = originalById.get(paymentId)!;
  const target = `${anchor.orderId ?? ''}:${anchor.serviceWorkOrderId ?? ''}`;
  if (!anchor.orderId && !anchor.serviceWorkOrderId) {
    throw new ConflictError('refund_target_missing', 'Исходный платёж не связан с заказом или ремонтом');
  }
  if (originals.some((original) => `${original.orderId ?? ''}:${original.serviceWorkOrderId ?? ''}` !== target)) {
    throw new ConflictError('refund_allocation_target_mismatch', 'Все платежи возврата должны относиться к одному документу');
  }

  const payoutShiftByPayment = new Map<string, string | null>();
  for (const allocation of allocations) {
    const original = originalById.get(allocation.paymentId)!;
    const [tenderRefunds, reservedRefunds] = await Promise.all([
      tx.payment.aggregate({
        where: { originalPaymentId: original.id },
        _sum: { amount: true },
      }),
      tx.refundAllocation.aggregate({
        where: {
          originalPaymentId: original.id,
          status: { in: ['queued', 'processing', 'provider_pending', 'failed'] },
          refund: { status: { in: ['requested', 'approved', 'processing', 'partially_succeeded', 'failed'] } },
        },
        _sum: { amount: true },
      }),
    ]);
    const available = original.amount + (tenderRefunds._sum.amount ?? 0) - (reservedRefunds._sum.amount ?? 0);
    if (allocation.amount > available) {
      throw new ValidationError('refund_exceeds_tender', `Возврат превышает остаток платежа ${original.id}`);
    }
    if (original.method === 'gift_card' && !original.giftCardId) {
      throw new ConflictError('giftcard_payment_unlinked', 'Исходный gift-card платёж не связан с картой');
    }
    if (original.method === 'cash') {
      if (!allocation.shiftId || !cashierStaffId) {
        throw new ValidationError('cash_refund_shift_required', 'Для каждой наличной аллокации нужна смена инициатора');
      }
      await tx.$queryRaw`SELECT id FROM "CashShift" WHERE id = ${allocation.shiftId} FOR UPDATE`;
      const shift = await tx.cashShift.findUnique({ where: { id: allocation.shiftId } });
      if (!shift || shift.closedAt) throw new ConflictError('cash_refund_shift_closed', 'Смена возврата закрыта или не найдена');
      if (shift.staffId !== cashierStaffId) throw new ConflictError('cash_refund_shift_foreign', 'Смена возврата принадлежит другому сотруднику');
      if (original.point && shift.point !== original.point) throw new ConflictError('cash_refund_shift_wrong_point', 'Смена возврата открыта в другой точке');
      payoutShiftByPayment.set(original.id, shift.id);
    } else {
      payoutShiftByPayment.set(original.id, null);
      if (original.method !== 'gift_card' && !allocation.externalReference) {
        throw new ValidationError('refund_external_reference_required', `Для платежа ${original.id} нужен референс провайдера или банка`);
      }
    }
  }
  const references = allocations.map((allocation) => allocation.externalReference).filter((value): value is string => Boolean(value));
  if (new Set(references).size !== references.length) {
    throw new ValidationError('duplicate_refund_reference', 'Референсы аллокаций возврата должны быть уникальными');
  }

  if (returnId) {
    await tx.$queryRaw`SELECT id FROM "Return" WHERE id = ${returnId} FOR UPDATE`;
    const ret = await tx.return.findUnique({ where: { id: returnId } });
    if (!ret) throw new ValidationError('return_not_found', 'Связанный возврат не найден');
    if (!anchor.orderId || ret.orderId !== anchor.orderId) {
      throw new ConflictError('refund_return_order_mismatch', 'Возврат и платежи относятся к разным заказам');
    }
    if (ret.status !== 'processing') throw new ConflictError('return_not_processing', `Возврат уже ${ret.status}`);
    if (amount !== ret.refundAmount) {
      throw new ValidationError('refund_return_amount_mismatch', `Сумма refund должна быть ${ret.refundAmount}`);
    }
  }

  let taxCode = 'none';
  let taxRateBps = 0;
  let documentTax = 0;
  let documentTotal = amount;
  let refundedBefore = 0;
  if (anchor.orderId) {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${anchor.orderId} FOR UPDATE`;
    const [net, order, priorRefunds] = await Promise.all([
      tx.payment.aggregate({ where: { orderId: anchor.orderId }, _sum: { amount: true } }),
      tx.order.findUnique({ where: { id: anchor.orderId }, include: { items: true } }),
      tx.payment.aggregate({ where: { orderId: anchor.orderId, amount: { lt: 0 } }, _sum: { amount: true } }),
    ]);
    if (amount > (net._sum.amount ?? 0)) throw new ValidationError('refund_exceeds_paid', 'Сумма возвратов превышает оплату заказа');
    if (!order) throw new ValidationError('order_not_found', 'Заказ возврата не найден');
    const metadata = outputTaxMetadata(order.items);
    taxCode = metadata.taxCode;
    taxRateBps = metadata.taxRateBps;
    documentTax = order.taxAmount;
    documentTotal = order.total;
    refundedBefore = Math.abs(priorRefunds._sum.amount ?? 0);
  } else if (anchor.serviceWorkOrderId) {
    await tx.$queryRaw`SELECT id FROM "ServiceWorkOrder" WHERE id = ${anchor.serviceWorkOrderId} FOR UPDATE`;
    const [net, workOrder, priorRefunds] = await Promise.all([
      tx.payment.aggregate({ where: { serviceWorkOrderId: anchor.serviceWorkOrderId }, _sum: { amount: true } }),
      tx.serviceWorkOrder.findUnique({
        where: { id: anchor.serviceWorkOrderId },
        select: { repairStartedAt: true, estimateAmount: true, taxCode: true, taxRateBps: true, taxAmount: true },
      }),
      tx.payment.aggregate({ where: { serviceWorkOrderId: anchor.serviceWorkOrderId, amount: { lt: 0 } }, _sum: { amount: true } }),
    ]);
    if (workOrder?.repairStartedAt) {
      throw new ConflictError('service_refund_after_start_forbidden', 'После начала ремонта возврат проводится только отдельной компенсацией с актом');
    }
    if (amount > (net._sum.amount ?? 0)) throw new ValidationError('refund_exceeds_paid', 'Сумма возвратов превышает оплату ремонта');
    if (!workOrder?.estimateAmount) throw new ConflictError('service_estimate_missing', 'У ремонта отсутствует налоговый первичный документ');
    const metadata = outputTaxMetadata([workOrder]);
    taxCode = metadata.taxCode;
    taxRateBps = metadata.taxRateBps;
    documentTax = workOrder.taxAmount;
    documentTotal = workOrder.estimateAmount;
    refundedBefore = Math.abs(priorRefunds._sum.amount ?? 0);
  }

  const refunds = [];
  let allocatedBefore = 0;
  for (const [index, allocation] of allocations.entries()) {
    const original = originalById.get(allocation.paymentId)!;
    const key = allocations.length === 1 ? `refund:${approvalId}` : `refund:${approvalId}:${index + 1}`;
    const compensating = await tx.payment.create({
      data: {
        orderId: original.orderId,
        serviceWorkOrderId: original.serviceWorkOrderId,
        originalPaymentId: original.id,
        amount: -allocation.amount,
        method: original.method,
        status: 'refunded',
        shiftId: payoutShiftByPayment.get(original.id) ?? null,
        giftCardId: original.giftCardId,
        accountCode: original.accountCode ?? paymentAccountCode(original.method),
        idempotencyKey: key,
        txnId: allocation.externalReference ? `refund:${original.method}:${allocation.externalReference}` : key,
        receivedBy: cashierStaffId ?? approver,
        point: original.point,
      },
    });
    const taxAmount = cumulativeTaxDelta(documentTax, documentTotal, refundedBefore + allocatedBefore, allocation.amount);
    const accountingEntry = await postPaymentEntryOnTx(tx, {
      payment: compensating,
      idempotencyKey: key,
      point: original.point,
      actor: approver,
      receivedBy: cashierStaffId,
      tax: { taxCode, taxRateBps, taxAmount },
    });
    if (original.method === 'gift_card') {
      const giftCardId = original.giftCardId!;
      await tx.$queryRaw`SELECT id FROM "GiftCard" WHERE id = ${giftCardId} FOR UPDATE`;
      const currentCard = await tx.giftCard.findUniqueOrThrow({ where: { id: giftCardId } });
      const card = await tx.giftCard.update({
        where: { id: giftCardId },
        data: {
          balance: { increment: allocation.amount },
          status: currentCard.status === 'redeemed' ? 'active' : currentCard.status,
        },
      });
      await tx.giftCardTransaction.create({
        data: {
          giftCardId,
          paymentId: compensating.id,
          type: 'refund',
          amount: allocation.amount,
          balanceAfter: card.balance,
          sourceRef: key,
          actor: approver,
        },
      });
    }
    allocatedBefore += allocation.amount;
    refunds.push(compensating);
    events.push({
      type: EventType.PaymentRefunded,
      actor: approver,
      payload: { approvalId, originalPaymentId: original.id, refundId: compensating.id, returnId, amount: allocation.amount, taxAmount },
      refs: [original.orderId, original.serviceWorkOrderId, original.id, compensating.id, returnId].filter((ref): ref is string => Boolean(ref)),
    });
    events.push({
      type: EventType.AccountingEntryPosted,
      actor: approver,
      payload: { accountingEntryId: accountingEntry.id, sourceType: 'payment.refund', sourceRef: compensating.id },
      refs: [accountingEntry.id, compensating.id, original.id],
    });
  }

  const refundIds = refunds.map((payment) => payment.id);
  const primaryRefundId = refundIds[0];
  if (anchor.orderId) {
    await applyCampaignRefundOnTx(tx, {
      orderId: anchor.orderId,
      refundPaymentId: primaryRefundId,
      returnId,
      amount,
      actor: approver,
    }, events);
    const order = await tx.order.findUnique({ where: { id: anchor.orderId } });
    if (order) {
      await reconcileRefundLoyaltyOnTx(tx, { order, refundPaymentId: primaryRefundId, actor: approver }, events);
    }
    const aggregate = await tx.payment.aggregate({ where: { orderId: anchor.orderId }, _sum: { amount: true } });
    if (order && (aggregate._sum.amount ?? 0) <= 0 && canTransition(order.status, 'refunded')) {
      await tx.order.update({ where: { id: order.id }, data: { status: 'refunded' } });
      events.push({ type: 'order.refunded', actor: approver, payload: { orderId: order.id, from: order.status }, refs: [order.id] });
    }
    if (returnId) {
      await tx.return.update({ where: { id: returnId }, data: { refundId: primaryRefundId, status: 'paid' } });
      events.push({
        type: 'return.paid',
        actor: approver,
        payload: { returnId, orderId: anchor.orderId, refundId: primaryRefundId, refundIds, amount },
        refs: [returnId, anchor.orderId, ...refundIds],
      });
    }
  }
};

/** FIN-003E refund aggregate: approval freezes the request; execution is a retryable saga. */
const refund: ActionExecutor = async (tx, payload, approver, approvalId, events) => {
  const refundId = String(payload['refundId'] ?? '');
  if (!refundId) {
    // Compatibility for approvals created before FIN-003E. New requests always
    // create a Refund aggregate and never enter this path.
    return legacy_refund(tx, payload, approver, approvalId, events);
  }
  await tx.$queryRaw`SELECT id FROM "Refund" WHERE id = ${refundId} FOR UPDATE`;
  const aggregate = await tx.refund.findUnique({ where: { id: refundId } });
  if (!aggregate) throw new ValidationError('refund_not_found', 'Refund не найден');
  if (aggregate.approvalId !== approvalId || aggregate.status !== 'requested') {
    throw new ConflictError('refund_approval_snapshot_changed', 'Refund больше не ожидает это согласование');
  }
  await tx.refund.update({
    where: { id: refundId },
    data: { status: 'approved', approver, approvedAt: new Date() },
  });
  events.push({
    type: 'refund.approved',
    actor: approver,
    payload: { refundId, approvalId, amount: aggregate.amount, returnId: aggregate.returnId },
    refs: [refundId, approvalId, aggregate.returnId, aggregate.orderId],
  });
};

const reject_refund: ActionRejectionExecutor = async (tx, payload, approver, approvalId, reason, events) => {
  const refundId = String(payload['refundId'] ?? '');
  if (!refundId) return;
  const aggregate = await tx.refund.findUnique({ where: { id: refundId } });
  if (!aggregate || aggregate.approvalId !== approvalId || aggregate.status !== 'requested') {
    throw new ConflictError('refund_approval_snapshot_changed', 'Refund больше не ожидает это согласование');
  }
  await tx.refund.update({ where: { id: refundId }, data: { status: 'rejected', approver } });
  await tx.return.update({ where: { id: aggregate.returnId }, data: { status: 'rejected' } });
  events.push({
    type: 'refund.rejected',
    actor: approver,
    payload: { refundId, approvalId, reason },
    refs: [refundId, approvalId, aggregate.returnId],
  });
};

/** price — apply a price change beyond the ±15% threshold. */
const price: ActionExecutor = async (tx, payload, approver, approvalId, events) => {
  const productId = String(payload['productId']);
  const newPrice = Number(payload['newPrice']);
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) throw new ValidationError('product_not_found', 'Товар не найден');
  await tx.product.update({ where: { id: productId }, data: { price: newPrice } });
  events.push({
    type: EventType.PriceChanged,
    actor: approver,
    payload: { approvalId, productId, from: product.price, to: newPrice },
    refs: [productId],
  });
};

/** write_off — record a stock write-off movement (owner-approved). */
const write_off: ActionExecutor = async (tx, payload, approver, approvalId, events) => {
  const productId = String(payload['productId']);
  const qty = Number(payload['qty']);
  const location = String(payload['location'] ?? '').trim();
  const reason = payload['reason'] ? String(payload['reason']) : null;
  if (!location) throw new ValidationError('location_required', 'Укажите склад списания');
  const balance = await lockQuantityBalance(tx, productId, location);
  if (balance.onHand - balance.reserved < qty) {
    throw new ConflictError('insufficient_available_stock', 'Списание превышает свободный остаток');
  }
  await assertStoreOwnedAvailable(tx, balance.id, balance.onHand - balance.reserved, qty);
  await tx.inventoryBalance.update({ where: { id: balance.id }, data: { onHand: { decrement: qty } } });
  const movement = await tx.inventoryMovement.create({
    data: { productId, qty: -Math.abs(qty), type: 'write_off', from: location, reason },
  });
  const valuation = await adjustQuantityValuationOnTx(tx, {
    movementId: movement.id,
    productId,
    balanceId: balance.id,
    location,
    quantityDelta: -Math.abs(qty),
    actor: approver,
    sourceType: 'inventory.write_off',
  });
  await tx.inventoryMovement.update({
    where: { id: movement.id },
    data: { unitCost: valuation.unitCost, totalValue: valuation.totalValue, valuationQty: valuation.complete ? Math.abs(qty) : null },
  });
  events.push({
    type: EventType.StockWrittenOff,
    actor: approver,
    payload: { approvalId, productId, location, qty, movementId: movement.id, reason, totalValue: valuation.totalValue },
    refs: [productId, movement.id],
  });
  if (valuation.entry) {
    events.push({
      type: EventType.AccountingEntryPosted,
      actor: approver,
      payload: { accountingEntryId: valuation.entry.id, sourceType: 'inventory.write_off', sourceRef: movement.id, amount: valuation.totalValue },
      refs: [valuation.entry.id, movement.id, productId],
    });
  }
};

/** stock_adjust — record a stock adjustment movement (owner-approved). */
const stock_adjust: ActionExecutor = async (tx, payload, approver, approvalId, events) => {
  const productId = String(payload['productId']);
  const qty = Number(payload['qty']);
  const location = String(payload['location'] ?? '').trim();
  const direction = String(payload['direction'] ?? 'increase');
  const reason = payload['reason'] ? String(payload['reason']) : null;
  const unitCost = Number(payload['unitCost'] ?? 0);
  if (!location) throw new ValidationError('location_required', 'Укажите склад корректировки');
  if (direction !== 'increase' && direction !== 'decrease') {
    throw new ValidationError('invalid_adjustment_direction', 'Неизвестное направление корректировки');
  }
  const delta = direction === 'decrease' ? -Math.abs(qty) : Math.abs(qty);
  let balance: Awaited<ReturnType<typeof lockQuantityBalance>>;
  if (delta < 0) {
    balance = await lockQuantityBalance(tx, productId, location);
    if (balance.onHand - balance.reserved < Math.abs(delta)) {
      throw new ConflictError('insufficient_available_stock', 'Корректировка превышает свободный остаток');
    }
    await assertStoreOwnedAvailable(tx, balance.id, balance.onHand - balance.reserved, Math.abs(delta));
    await tx.inventoryBalance.update({ where: { id: balance.id }, data: { onHand: { decrement: Math.abs(delta) } } });
  } else {
    balance = await tx.inventoryBalance.upsert({
      where: { productId_location: { productId, location } },
      create: { productId, location, onHand: delta },
      update: { onHand: { increment: delta } },
    });
  }
  const movement = await tx.inventoryMovement.create({
    data: { productId, qty: delta, type: 'adjust', from: location, reason },
  });
  const valuation = await adjustQuantityValuationOnTx(tx, {
    movementId: movement.id,
    productId,
    balanceId: balance.id,
    location,
    quantityDelta: delta,
    unitCost,
    actor: approver,
    sourceType: 'inventory.adjustment',
  });
  await tx.inventoryMovement.update({
    where: { id: movement.id },
    data: { unitCost: valuation.unitCost, totalValue: valuation.totalValue, valuationQty: valuation.complete ? Math.abs(delta) : null },
  });
  events.push({
    type: EventType.StockAdjusted,
    actor: approver,
    payload: { approvalId, productId, location, qty: delta, direction, movementId: movement.id, reason, totalValue: valuation.totalValue },
    refs: [productId, movement.id],
  });
  if (valuation.entry) {
    events.push({
      type: EventType.AccountingEntryPosted,
      actor: approver,
      payload: { accountingEntryId: valuation.entry.id, sourceType: 'inventory.adjustment', sourceRef: movement.id, amount: valuation.totalValue },
      refs: [valuation.entry.id, movement.id, productId],
    });
  }
};

/** quarantine_write_off — owner-approved disposal of one diagnosed returned IMEI. */
const quarantine_write_off: ActionExecutor = async (tx, payload, approver, approvalId, events) => {
  const quarantineId = String(payload['quarantineId']);
  const unitId = String(payload['unitId']);
  const unitCost = Number(payload['unitCost']);
  await tx.$queryRaw`SELECT id FROM "InventoryQuarantineCase" WHERE id = ${quarantineId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "DeviceUnit" WHERE id = ${unitId} FOR UPDATE`;
  const quarantine = await tx.inventoryQuarantineCase.findUnique({
    where: { id: quarantineId },
    include: { unit: true },
  });
  if (!quarantine) throw new ValidationError('quarantine_not_found', 'Карантинная запись не найдена');
  if (quarantine.dispositionApprovalId !== approvalId
    || quarantine.unitId !== unitId
    || quarantine.unitCost !== unitCost) {
    throw new ConflictError('quarantine_approval_snapshot_changed', 'Снимок карантинного списания изменён');
  }
  if (quarantine.status !== 'diagnosed' || quarantine.diagnosis !== 'write_off') {
    throw new ConflictError('quarantine_not_writeoff_ready', 'Карантин больше не ожидает списание');
  }
  if (quarantine.diagnosedBy === approver) {
    throw new ConflictError('quarantine_four_eyes_required', 'Диагност не может согласовать списание');
  }
  const unitUpdate = await tx.deviceUnit.updateMany({
    where: { id: unitId, status: 'returned' },
    data: { status: 'written_off' },
  });
  if (unitUpdate.count !== 1) {
    throw new ConflictError('quarantine_unit_state_mismatch', 'IMEI уже обработан другой операцией');
  }
  const movement = await tx.inventoryMovement.create({
    data: {
      productId: quarantine.unit.productId,
      qty: -1,
      type: 'write_off',
      from: quarantine.unit.location,
      reason: `quarantine:${quarantineId}`,
      unitCost,
      totalValue: unitCost,
    },
  });
  await tx.inventoryValuationIssue.create({
    data: {
      productId: quarantine.unit.productId,
      imei: quarantine.unit.imei,
      sourceType: 'inventory.quarantine.write_off',
      sourceRef: quarantineId,
      location: quarantine.unit.location,
      quantity: 1,
      unitCost,
      totalCost: unitCost,
    },
  });
  let accountingEntryId: string | null = null;
  if (unitCost > 0) {
    const entry = await postAccountingEntryOnTx(tx, {
      idempotencyKey: `accounting:inventory:quarantine:${quarantineId}`,
      sourceType: 'inventory.quarantine.write_off',
      sourceRef: quarantineId,
      description: `Списание IMEI ${quarantine.unit.imei} после карантина`,
      point: quarantine.unit.location,
      documentAmount: unitCost,
      baseAmount: unitCost,
      occurredAt: new Date(),
      createdBy: approver,
      lines: [
        { accountCode: '6900', debit: unitCost },
        { accountCode: '1200', credit: unitCost },
      ],
    });
    accountingEntryId = entry.id;
    events.push({
      type: EventType.AccountingEntryPosted,
      actor: approver,
      payload: { accountingEntryId: entry.id, sourceType: 'inventory.quarantine.write_off', quarantineId, amount: unitCost },
      refs: [entry.id, quarantineId, quarantine.unit.imei],
    });
  }
  await tx.inventoryQuarantineCase.update({
    where: { id: quarantineId },
    data: { status: 'disposed', disposition: 'write_off', disposedBy: approver, disposedAt: new Date() },
  });
  events.push({
    type: EventType.StockWrittenOff,
    actor: approver,
    payload: { approvalId, quarantineId, productId: quarantine.unit.productId, imei: quarantine.unit.imei, movementId: movement.id, totalValue: unitCost },
    refs: [approvalId, quarantineId, quarantine.unit.imei, movement.id],
  });
  events.push({
    type: EventType.InventoryDisposed,
    actor: approver,
    payload: { quarantineId, disposition: 'write_off', imei: quarantine.unit.imei, movementId: movement.id, accountingEntryId },
    refs: [quarantineId, quarantine.unit.imei, movement.id],
  });
};

const reject_quarantine_write_off: ActionRejectionExecutor = async (
  tx,
  payload,
  approver,
  approvalId,
  reason,
  events,
) => {
  const quarantineId = String(payload['quarantineId']);
  await tx.$queryRaw`SELECT id FROM "InventoryQuarantineCase" WHERE id = ${quarantineId} FOR UPDATE`;
  const cleared = await tx.inventoryQuarantineCase.updateMany({
    where: { id: quarantineId, status: 'diagnosed', dispositionApprovalId: approvalId },
    data: { dispositionApprovalId: null },
  });
  if (cleared.count !== 1) {
    throw new ConflictError('quarantine_approval_snapshot_changed', 'Карантин больше не ожидает это согласование');
  }
  events.push({
    type: EventType.InventoryDiagnosed,
    actor: approver,
    payload: { quarantineId, writeOffApprovalId: approvalId, rejected: true, reason },
    refs: [quarantineId, approvalId],
  });
};

async function lockQuantityBalance(tx: Prisma.TransactionClient, productId: string, location: string) {
  await tx.$queryRaw`SELECT id FROM "InventoryBalance" WHERE "productId" = ${productId} AND location = ${location} FOR UPDATE`;
  const balance = await tx.inventoryBalance.findUnique({ where: { productId_location: { productId, location } } });
  if (!balance) throw new ConflictError('inventory_balance_not_found', `На складе ${location} нет остатка товара`);
  return balance;
}

async function assertStoreOwnedAvailable(
  tx: Prisma.TransactionClient,
  balanceId: string,
  aggregateAvailable: number,
  qty: number,
) {
  const ownerStock = await tx.quantityConsignmentLot.aggregate({
    where: { balanceId },
    _sum: { availableQty: true },
  });
  const storeOwnedAvailable = aggregateAvailable - (ownerStock._sum.availableQty ?? 0);
  if (storeOwnedAvailable < qty) {
    throw new ConflictError(
      'consignment_stock_requires_owner_process',
      'Обычное списание не может уменьшать чужой товар; используйте комиссионный процесс владельца',
    );
  }
}

/** delete — soft-delete a product (archived = true). */
const del: ActionExecutor = async (tx, payload, approver, approvalId, events) => {
  const productId = String(payload['productId']);
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) throw new ValidationError('product_not_found', 'Товар не найден');
  await tx.product.update({ where: { id: productId }, data: { archived: true } });
  events.push({
    type: EventType.ProductArchived,
    actor: approver,
    payload: { approvalId, productId },
    refs: [productId],
  });
};

/** debt — book a sale-on-credit that exceeded the debt limit (owner/senior approved). */
const debt: ActionExecutor = async (tx, payload, approver, approvalId, events) => {
  await insertDebt(
    tx,
    {
      orderId: String(payload['orderId']),
      customerId: String(payload['customerId']),
      principal: Number(payload['principal']),
      installments: Number(payload['installments'] ?? 1),
      dueDate: new Date(String(payload['dueDate'])),
      idempotencyKey: `approval:${approvalId}`,
    },
    approver,
    events,
  );
};

export const ACTION_EXECUTORS: Record<string, ActionExecutor> = {
  campaign_budget,
  refund,
  price,
  write_off,
  stock_adjust,
  quarantine_write_off,
  delete: del,
  debt,
};

export const ACTION_REJECTION_EXECUTORS: Record<string, ActionRejectionExecutor> = {
  campaign_budget: reject_campaign_budget,
  refund: reject_refund,
  quarantine_write_off: reject_quarantine_write_off,
};
