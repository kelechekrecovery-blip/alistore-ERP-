import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { canTransition } from '../orders/order-state-machine';
import { insertDebt } from '../debts/debt-insert';
import { reconcileRefundLoyaltyOnTx } from '../customers/loyalty-ledger';

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

/** refund — compensating negative Payment, order → refunded (invariant #1). */
const refund: ActionExecutor = async (tx, payload, approver, approvalId, events) => {
  const paymentId = String(payload['paymentId']);
  const amount = Number(payload['amount']);
  const returnId = payload['returnId'] ? String(payload['returnId']) : null;
  const original = await tx.payment.findUnique({ where: { id: paymentId } });
  if (!original) {
    throw new ValidationError('payment_not_found', 'Платёж для возврата не найден');
  }
  if (amount <= 0 || amount > original.amount) {
    throw new ValidationError('invalid_refund_amount', 'Некорректная сумма возврата');
  }
  await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
  const tenderRefunds = await tx.payment.aggregate({
    where: { originalPaymentId: paymentId },
    _sum: { amount: true },
  });
  const tenderRemaining = original.amount + (tenderRefunds._sum.amount ?? 0);
  if (amount > tenderRemaining) {
    throw new ValidationError('refund_exceeds_tender', 'Сумма возвратов превышает остаток исходного платежа');
  }
  if (returnId) {
    await tx.$queryRaw`SELECT id FROM "Return" WHERE id = ${returnId} FOR UPDATE`;
    const ret = await tx.return.findUnique({ where: { id: returnId } });
    if (!ret) throw new ValidationError('return_not_found', 'Связанный возврат не найден');
    if (!original.orderId || ret.orderId !== original.orderId) {
      throw new ConflictError('refund_return_order_mismatch', 'Возврат и платёж относятся к разным заказам');
    }
    if (ret.status !== 'processing') {
      throw new ConflictError('return_not_processing', `Возврат уже ${ret.status}`);
    }
    if (amount !== ret.refundAmount) {
      throw new ValidationError('refund_return_amount_mismatch', `Сумма refund должна быть ${ret.refundAmount}`);
    }
  }
  if (original.orderId) {
    // Serialize concurrent refunds on this order (row lock), then cap total
    // refunds at net paid (invariant #1: сумма возвратов ≤ оплаченной) — two
    // 100k refunds against a 100k order can't both land.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${original.orderId} FOR UPDATE`;
    const agg = await tx.payment.aggregate({
      where: { orderId: original.orderId },
      _sum: { amount: true },
    });
    const netPaid = agg._sum.amount ?? 0;
    if (amount > netPaid) {
      throw new ValidationError(
        'refund_exceeds_paid',
        'Сумма возвратов превышает оплаченную по заказу',
      );
    }
  } else if (original.serviceWorkOrderId) {
    await tx.$queryRaw`SELECT id FROM "ServiceWorkOrder" WHERE id = ${original.serviceWorkOrderId} FOR UPDATE`;
    const agg = await tx.payment.aggregate({
      where: { serviceWorkOrderId: original.serviceWorkOrderId },
      _sum: { amount: true },
    });
    if (amount > (agg._sum.amount ?? 0)) {
      throw new ValidationError('refund_exceeds_paid', 'Сумма возвратов превышает оплату ремонта');
    }
  }
  const compensating = await tx.payment.create({
    data: {
      orderId: original.orderId,
      serviceWorkOrderId: original.serviceWorkOrderId,
      originalPaymentId: original.id,
      amount: -Math.abs(amount),
      method: original.method,
      status: 'refunded',
    },
  });
  events.push({
    type: EventType.PaymentRefunded,
    actor: approver,
    payload: { approvalId, originalPaymentId: paymentId, refundId: compensating.id, returnId, amount },
    refs: [original.orderId, original.serviceWorkOrderId, paymentId, compensating.id, returnId].filter((r): r is string => Boolean(r)),
  });
  if (original.orderId) {
    const order = await tx.order.findUnique({ where: { id: original.orderId } });
    if (order) {
      await reconcileRefundLoyaltyOnTx(tx, {
        order,
        refundPaymentId: compensating.id,
        actor: approver,
      }, events);
    }
    const aggregate = await tx.payment.aggregate({
      where: { orderId: original.orderId },
      _sum: { amount: true },
    });
    const fullyRefunded = (aggregate._sum.amount ?? 0) <= 0;
    if (order && fullyRefunded && canTransition(order.status, 'refunded')) {
      await tx.order.update({ where: { id: order.id }, data: { status: 'refunded' } });
      events.push({
        type: 'order.refunded',
        actor: approver,
        payload: { orderId: order.id, from: order.status },
        refs: [order.id],
      });
    }
    if (returnId) {
      await tx.return.update({
        where: { id: returnId },
        data: { refundId: compensating.id, status: 'paid' },
      });
      events.push({
        type: 'return.paid',
        actor: approver,
        payload: { returnId, orderId: original.orderId, refundId: compensating.id, amount },
        refs: [returnId, original.orderId, compensating.id],
      });
    }
  }
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
  events.push({
    type: EventType.StockWrittenOff,
    actor: approver,
    payload: { approvalId, productId, location, qty, movementId: movement.id, reason },
    refs: [productId, movement.id],
  });
};

/** stock_adjust — record a stock adjustment movement (owner-approved). */
const stock_adjust: ActionExecutor = async (tx, payload, approver, approvalId, events) => {
  const productId = String(payload['productId']);
  const qty = Number(payload['qty']);
  const location = String(payload['location'] ?? '').trim();
  const direction = String(payload['direction'] ?? 'increase');
  const reason = payload['reason'] ? String(payload['reason']) : null;
  if (!location) throw new ValidationError('location_required', 'Укажите склад корректировки');
  if (direction !== 'increase' && direction !== 'decrease') {
    throw new ValidationError('invalid_adjustment_direction', 'Неизвестное направление корректировки');
  }
  const delta = direction === 'decrease' ? -Math.abs(qty) : Math.abs(qty);
  if (delta < 0) {
    const balance = await lockQuantityBalance(tx, productId, location);
    if (balance.onHand - balance.reserved < Math.abs(delta)) {
      throw new ConflictError('insufficient_available_stock', 'Корректировка превышает свободный остаток');
    }
    await assertStoreOwnedAvailable(tx, balance.id, balance.onHand - balance.reserved, Math.abs(delta));
    await tx.inventoryBalance.update({ where: { id: balance.id }, data: { onHand: { decrement: Math.abs(delta) } } });
  } else {
    await tx.inventoryBalance.upsert({
      where: { productId_location: { productId, location } },
      create: { productId, location, onHand: delta },
      update: { onHand: { increment: delta } },
    });
  }
  const movement = await tx.inventoryMovement.create({
    data: { productId, qty: delta, type: 'adjust', from: location, reason },
  });
  events.push({
    type: EventType.StockAdjusted,
    actor: approver,
    payload: { approvalId, productId, location, qty: delta, direction, movementId: movement.id, reason },
    refs: [productId, movement.id],
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
const debt: ActionExecutor = async (tx, payload, approver, _approvalId, events) => {
  await insertDebt(
    tx,
    {
      orderId: String(payload['orderId']),
      customerId: String(payload['customerId']),
      principal: Number(payload['principal']),
      installments: Number(payload['installments'] ?? 1),
      dueDate: new Date(String(payload['dueDate'])),
    },
    approver,
    events,
  );
};

export const ACTION_EXECUTORS: Record<string, ActionExecutor> = {
  refund,
  price,
  write_off,
  stock_adjust,
  delete: del,
  debt,
};
