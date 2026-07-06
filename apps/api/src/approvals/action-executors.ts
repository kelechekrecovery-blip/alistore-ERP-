import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ValidationError } from '../common/errors';
import { canTransition } from '../orders/order-state-machine';

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
  const original = await tx.payment.findUnique({ where: { id: paymentId } });
  if (!original) {
    throw new ValidationError('payment_not_found', 'Платёж для возврата не найден');
  }
  if (amount <= 0 || amount > original.amount) {
    throw new ValidationError('invalid_refund_amount', 'Некорректная сумма возврата');
  }
  const compensating = await tx.payment.create({
    data: {
      orderId: original.orderId,
      amount: -Math.abs(amount),
      method: original.method,
      status: 'refunded',
    },
  });
  events.push({
    type: EventType.PaymentRefunded,
    actor: approver,
    payload: { approvalId, originalPaymentId: paymentId, refundId: compensating.id, amount },
    refs: [original.orderId, paymentId, compensating.id].filter((r): r is string => Boolean(r)),
  });
  if (original.orderId) {
    const order = await tx.order.findUnique({ where: { id: original.orderId } });
    if (order && canTransition(order.status, 'refunded')) {
      await tx.order.update({ where: { id: order.id }, data: { status: 'refunded' } });
      events.push({
        type: 'order.refunded',
        actor: approver,
        payload: { orderId: order.id, from: order.status },
        refs: [order.id],
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
  const reason = payload['reason'] ? String(payload['reason']) : null;
  const movement = await tx.inventoryMovement.create({
    data: { productId, qty: -Math.abs(qty), type: 'write_off', reason },
  });
  events.push({
    type: EventType.StockWrittenOff,
    actor: approver,
    payload: { approvalId, productId, qty, movementId: movement.id, reason },
    refs: [productId, movement.id],
  });
};

/** stock_adjust — record a stock adjustment movement (owner-approved). */
const stock_adjust: ActionExecutor = async (tx, payload, approver, approvalId, events) => {
  const productId = String(payload['productId']);
  const qty = Number(payload['qty']);
  const reason = payload['reason'] ? String(payload['reason']) : null;
  const movement = await tx.inventoryMovement.create({
    data: { productId, qty, type: 'adjust', reason },
  });
  events.push({
    type: EventType.StockAdjusted,
    actor: approver,
    payload: { approvalId, productId, qty, movementId: movement.id, reason },
    refs: [productId, movement.id],
  });
};

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

export const ACTION_EXECUTORS: Record<string, ActionExecutor> = {
  refund,
  price,
  write_off,
  stock_adjust,
  delete: del,
};
