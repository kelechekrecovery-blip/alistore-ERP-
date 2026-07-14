import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';

const EARN_RATE_BPS = 100;

export async function loyaltyBalanceOnTx(
  tx: Prisma.TransactionClient,
  customerId: string,
  now = new Date(),
): Promise<number> {
  const aggregate = await tx.loyaltyEntry.aggregate({
    where: {
      customerId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    _sum: { amount: true },
  });
  return Math.max(0, aggregate._sum.amount ?? 0);
}

export async function redeemLoyaltyOnTx(
  tx: Prisma.TransactionClient,
  input: { customerId: string; orderId: string; requested: number; maximum: number; actor: string },
  events: AuditInput[],
): Promise<number> {
  if (!Number.isInteger(input.requested) || input.requested < 0) {
    throw new ValidationError('invalid_loyalty_amount', 'Количество бонусов должно быть целым неотрицательным числом');
  }
  if (input.requested === 0) return 0;
  if (input.requested > input.maximum) {
    throw new ValidationError('loyalty_exceeds_order', `Для этого заказа можно списать не более ${input.maximum} бонусов`);
  }

  await lockCustomerLoyalty(tx, input.customerId);
  const available = await loyaltyBalanceOnTx(tx, input.customerId);
  if (input.requested > available) {
    throw new ConflictError('insufficient_loyalty_balance', `Доступно только ${available} бонусов`);
  }

  const entry = await tx.loyaltyEntry.create({
    data: {
      customerId: input.customerId,
      kind: 'redeem',
      label: 'Списание по заказу',
      amount: -input.requested,
      sourceRef: `loyalty:redeem:${input.orderId}`,
      orderId: input.orderId,
    },
  });
  events.push({
    type: EventType.LoyaltyRedeemed,
    actor: input.actor,
    payload: { customerId: input.customerId, orderId: input.orderId, entryId: entry.id, amount: input.requested },
    refs: [input.customerId, input.orderId, entry.id],
  });
  return input.requested;
}

export async function earnLoyaltyOnTx(
  tx: Prisma.TransactionClient,
  input: { customerId: string; orderId: string; paidTotal: number; paymentId?: string; actor: string },
  events: AuditInput[],
): Promise<number> {
  const amount = Math.floor((Math.max(0, input.paidTotal) * EARN_RATE_BPS) / 10_000);
  if (amount <= 0) return 0;
  await lockCustomerLoyalty(tx, input.customerId);
  const sourceRef = `loyalty:earn:${input.orderId}`;
  const existing = await tx.loyaltyEntry.findUnique({ where: { sourceRef } });
  if (existing) return Math.max(0, existing.amount);
  const entry = await tx.loyaltyEntry.create({
    data: {
      customerId: input.customerId,
      kind: 'earn',
      label: 'Кэшбэк за покупку',
      amount,
      sourceRef,
      orderId: input.orderId,
      paymentId: input.paymentId,
    },
  });
  events.push({
    type: EventType.LoyaltyEarned,
    actor: input.actor,
    payload: { customerId: input.customerId, orderId: input.orderId, paymentId: input.paymentId ?? null, entryId: entry.id, amount },
    refs: [input.customerId, input.orderId, input.paymentId, entry.id].filter((value): value is string => Boolean(value)),
  });
  return amount;
}

export async function reconcileRefundLoyaltyOnTx(
  tx: Prisma.TransactionClient,
  input: {
    order: { id: string; customerId: string; total: number; loyaltyRedeemed: number; loyaltyEarned: number };
    refundPaymentId: string;
    actor: string;
  },
  events: AuditInput[],
): Promise<void> {
  const { order } = input;
  if (order.total <= 0 || (order.loyaltyRedeemed <= 0 && order.loyaltyEarned <= 0)) return;
  await lockCustomerLoyalty(tx, order.customerId);
  const refunds = await tx.payment.aggregate({
    where: { orderId: order.id, amount: { lt: 0 } },
    _sum: { amount: true },
  });
  const refunded = Math.min(order.total, Math.abs(refunds._sum.amount ?? 0));
  const targetRestore = Math.min(order.loyaltyRedeemed, Math.floor((order.loyaltyRedeemed * refunded) / order.total));
  const targetClawback = Math.min(order.loyaltyEarned, Math.ceil((order.loyaltyEarned * refunded) / order.total));
  const existing = await tx.loyaltyEntry.groupBy({
    by: ['kind'],
    where: { orderId: order.id, kind: { in: ['refund_restore', 'refund_clawback'] } },
    _sum: { amount: true },
  });
  const restored = existing.find((row) => row.kind === 'refund_restore')?._sum.amount ?? 0;
  const clawedBack = Math.abs(existing.find((row) => row.kind === 'refund_clawback')?._sum.amount ?? 0);
  const restoreDelta = Math.max(0, targetRestore - restored);
  const clawbackDelta = Math.max(0, targetClawback - clawedBack);

  if (restoreDelta > 0) {
    const entry = await tx.loyaltyEntry.create({
      data: {
        customerId: order.customerId,
        kind: 'refund_restore',
        label: 'Возврат списанных бонусов',
        amount: restoreDelta,
        sourceRef: `loyalty:refund-restore:${input.refundPaymentId}`,
        orderId: order.id,
        paymentId: input.refundPaymentId,
      },
    });
    events.push({
      type: EventType.LoyaltyRefundRestored,
      actor: input.actor,
      payload: { orderId: order.id, paymentId: input.refundPaymentId, entryId: entry.id, amount: restoreDelta },
      refs: [order.id, input.refundPaymentId, entry.id],
    });
  }
  if (clawbackDelta > 0) {
    const entry = await tx.loyaltyEntry.create({
      data: {
        customerId: order.customerId,
        kind: 'refund_clawback',
        label: 'Корректировка кэшбэка после возврата',
        amount: -clawbackDelta,
        sourceRef: `loyalty:refund-clawback:${input.refundPaymentId}`,
        orderId: order.id,
        paymentId: input.refundPaymentId,
      },
    });
    events.push({
      type: EventType.LoyaltyRefundClawedBack,
      actor: input.actor,
      payload: { orderId: order.id, paymentId: input.refundPaymentId, entryId: entry.id, amount: clawbackDelta },
      refs: [order.id, input.refundPaymentId, entry.id],
    });
  }
}

async function lockCustomerLoyalty(tx: Prisma.TransactionClient, customerId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'customer-loyalty:' + customerId}))::text AS locked`;
}
