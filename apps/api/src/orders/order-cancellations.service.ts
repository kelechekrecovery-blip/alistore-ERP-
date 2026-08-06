import { Injectable, Optional } from '@nestjs/common';
import {
  OrderCancellationPolicy,
  OrderCancellationStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { isUniqueConstraintViolation } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { enqueueSupplyCustomerNotice } from '../outbox/customer-notifications';
import { OutboxService } from '../outbox/outbox.service';
import { FeatureFlagKey } from '../feature-flags/feature-flags.registry';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';

const ACTIVE_STATUSES: OrderCancellationStatus[] = [
  'requested',
  'awaiting_owner',
  'approved',
  'refund_queued',
  'refund_processing',
  'refund_failed',
];

const PUBLIC_SELECT = {
  id: true,
  orderId: true,
  status: true,
  policySnapshot: true,
  purchaseOrderSentSnapshot: true,
  depositPaidSnapshot: true,
  requestedRefundAmount: true,
  approvedRefundAmount: true,
  customerReason: true,
  ownerReason: true,
  refundId: true,
  createdAt: true,
  resolvedAt: true,
  completedAt: true,
} satisfies Prisma.OrderCancellationSelect;

type CancellationSource = {
  id: string;
  status: string;
  isDemo: boolean;
  items: Array<{
    supplyModeSnapshot: string;
    fulfillmentStatus: string;
  }>;
  receivables: Array<{
    amount: number;
    settledAmount: number;
  }>;
  purchaseOrders: Array<{
    sentAt: Date | null;
  }>;
};

@Injectable()
export class OrderCancellationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly featureFlags: FeatureFlagsService,
    @Optional() private readonly outbox?: OutboxService,
  ) {}

  async preview(orderId: string, customerId: string) {
    const order = await this.readSource(this.prisma, orderId, customerId);
    if (!order) return null;
    const preview = cancellationPreview(order);
    const [cancellationEnabled, autoRefundEnabled] = await Promise.all([
      this.featureFlags.isEnabled(FeatureFlagKey.Cancellation),
      this.featureFlags.isEnabled(FeatureFlagKey.AutoRefund),
    ]);
    return {
      ...preview,
      requestEnabled: cancellationEnabled && (preview.ownerReviewRequired || autoRefundEnabled),
      automaticRefundEnabled: autoRefundEnabled,
    };
  }

  current(orderId: string, customerId: string) {
    return this.prisma.orderCancellation.findFirst({
      where: { orderId, order: { customerId } },
      select: PUBLIC_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async request(
    orderId: string,
    customerId: string,
    reason: string,
    idempotencyKey: string,
  ) {
    if (!await this.featureFlags.isEnabled(FeatureFlagKey.Cancellation)) {
      throw new ConflictError(
        'supply_cancellation_disabled',
        'Отмена заказных товаров пока не включена',
      );
    }
    const normalizedReason = reason.trim();
    const requestHash = hashRequest({ orderId, customerId, reason: normalizedReason });
    const replay = await this.prisma.orderCancellation.findUnique({
      where: { idempotencyKey },
      select: { ...PUBLIC_SELECT, requestHash: true, customerIdSnapshot: true },
    });
    if (replay) return replayCancellation(replay, orderId, customerId, requestHash);

    try {
      return await this.audit.transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'order-cancellation:' + idempotencyKey}))::text AS locked`;
        const lockedReplay = await tx.orderCancellation.findUnique({
          where: { idempotencyKey },
          select: { ...PUBLIC_SELECT, requestHash: true, customerIdSnapshot: true },
        });
        if (lockedReplay) {
          return {
            result: replayCancellation(lockedReplay, orderId, customerId, requestHash),
            events: [],
          };
        }

        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
        const order = await this.readSource(tx, orderId, customerId);
        if (!order) {
          throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
        }
        const active = await tx.orderCancellation.findFirst({
          where: { orderId, status: { in: ACTIVE_STATUSES } },
          select: { id: true },
        });
        if (active) {
          throw new ConflictError(
            'order_cancellation_active',
            'По заказу уже рассматривается отмена',
          );
        }
        const preview = cancellationPreview(order);
        if (!preview.canCancel) {
          throw new ConflictError(
            preview.blockedReason ?? 'order_cancellation_forbidden',
            cancellationBlockedMessage(preview.blockedReason),
          );
        }
        if (preview.policy === 'automatic_full'
          && !await this.featureFlags.isEnabled(FeatureFlagKey.AutoRefund)) {
          throw new ConflictError(
            'supply_auto_refund_disabled',
            'Автоматический возврат задатка пока не включён',
          );
        }

        const policy = preview.policy as OrderCancellationPolicy;
        const status: OrderCancellationStatus = preview.ownerReviewRequired
          ? 'awaiting_owner'
          : 'requested';
        const cancellation = await tx.orderCancellation.create({
          data: {
            orderId,
            customerIdSnapshot: customerId,
            status,
            policySnapshot: policy,
            purchaseOrderSentSnapshot: preview.purchaseOrderSent,
            depositPaidSnapshot: preview.depositPaid,
            requestedRefundAmount: preview.estimatedRefundAmount,
            customerReason: normalizedReason,
            idempotencyKey,
            requestHash,
            requestedBy: customerId,
          },
          select: PUBLIC_SELECT,
        });
        const automatic = policy === 'automatic_full'
          ? await this.applyAutomaticCancellationOnTx(
            tx,
            cancellation.id,
            orderId,
            customerId,
            normalizedReason,
            requestHash,
            preview.depositPaid,
          )
          : cancellation;
        const events: AuditInput[] = [{
          type: EventType.OrderCancellationRequested,
          actor: customerId,
          payload: {
            cancellationId: cancellation.id,
            orderId,
            policy,
            purchaseOrderSent: preview.purchaseOrderSent,
            depositPaid: preview.depositPaid,
            requestedRefundAmount: preview.estimatedRefundAmount,
          },
          refs: [cancellation.id, orderId],
        }];
        if (policy === 'owner_resolution') {
          events.push({
            type: EventType.OrderCancellationOwnerReviewRequired,
            actor: customerId,
            payload: { cancellationId: cancellation.id, orderId },
            refs: [cancellation.id, orderId],
          });
        } else if (preview.depositPaid > 0) {
          events.push({
            type: EventType.OrderCancellationRefundQueued,
            actor: 'system:pre-po-cancellation',
            payload: {
              cancellationId: cancellation.id,
              orderId,
              refundId: automatic.refundId,
              amount: preview.depositPaid,
            },
            refs: [cancellation.id, orderId, automatic.refundId!],
          });
        } else {
          events.push({
            type: EventType.OrderCancellationCompleted,
            actor: 'system:pre-po-cancellation',
            payload: { cancellationId: cancellation.id, orderId, refundAmount: 0 },
            refs: [cancellation.id, orderId],
          });
        }
        if (this.outbox) {
          await enqueueSupplyCustomerNotice(tx, this.outbox, {
            customerId,
            template: 'supply_cancellation_requested',
            eventKey: cancellation.id,
            payload: { orderId },
          });
          if (policy === 'owner_resolution') {
            await enqueueSupplyCustomerNotice(tx, this.outbox, {
              customerId,
              template: 'supply_cancellation_owner_review',
              eventKey: cancellation.id,
              payload: { orderId },
            });
          } else if (preview.depositPaid > 0 && automatic.refundId) {
            await enqueueSupplyCustomerNotice(tx, this.outbox, {
              customerId,
              template: 'supply_refund_queued',
              eventKey: automatic.refundId,
              payload: {
                orderId,
                refundId: automatic.refundId,
                amount: preview.depositPaid,
              },
            });
          }
        }
        return {
          result: automatic,
          events,
        };
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      const racedReplay = await this.prisma.orderCancellation.findUnique({
        where: { idempotencyKey },
        select: { ...PUBLIC_SELECT, requestHash: true, customerIdSnapshot: true },
      });
      if (racedReplay) return replayCancellation(racedReplay, orderId, customerId, requestHash);
      throw new ConflictError(
        'order_cancellation_active',
        'По заказу уже рассматривается отмена',
      );
    }
  }

  private readSource(
    db: PrismaService | Prisma.TransactionClient,
    orderId: string,
    customerId: string,
  ): Promise<CancellationSource | null> {
    return db.order.findFirst({
      where: { id: orderId, customerId },
      select: {
        id: true,
        status: true,
        isDemo: true,
        items: {
          select: {
            supplyModeSnapshot: true,
            fulfillmentStatus: true,
          },
        },
        receivables: {
          where: { kind: 'supply_deposit' },
          select: { amount: true, settledAmount: true },
        },
        purchaseOrders: {
          select: { sentAt: true },
        },
      },
    });
  }

  private async applyAutomaticCancellationOnTx(
    tx: Prisma.TransactionClient,
    cancellationId: string,
    orderId: string,
    customerId: string,
    reason: string,
    requestHash: string,
    depositPaid: number,
  ) {
    const supplies = await tx.orderLineSupply.findMany({
      where: { orderItem: { orderId, supplyModeSnapshot: 'to_order' } },
      select: {
        id: true,
        orderItemId: true,
        supplierOfferId: true,
        orderedQty: true,
        status: true,
      },
      orderBy: { id: 'asc' },
    });
    for (const supply of supplies) {
      if (supply.supplierOfferId) {
        await tx.$queryRaw`SELECT id FROM "SupplierOffer" WHERE id = ${supply.supplierOfferId} FOR UPDATE`;
        await tx.supplierOffer.update({
          where: { id: supply.supplierOfferId },
          data: { availableQty: { increment: supply.orderedQty } },
        });
      }
      await tx.orderLineSupply.update({
        where: { id: supply.id },
        data: { status: 'customer_cancelled', actor: customerId },
      });
      await tx.orderItem.update({
        where: { id: supply.orderItemId },
        data: { fulfillmentStatus: 'customer_cancelled' },
      });
    }
    await tx.purchaseOrder.updateMany({
      where: { sourceOrderId: orderId, status: 'draft', sentAt: null },
      data: { status: 'cancelled' },
    });
    await tx.orderReceivable.updateMany({
      where: {
        orderId,
        status: { in: ['open', 'partially_settled', 'settled'] },
      },
      data: { status: 'cancelled' },
    });
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'cancelled' },
    });

    if (depositPaid === 0) {
      return tx.orderCancellation.update({
        where: { id: cancellationId },
        data: {
          status: 'cancelled',
          approvedRefundAmount: 0,
          completedAt: new Date(),
        },
        select: PUBLIC_SELECT,
      });
    }

    const sourceAllocations = await tx.paymentReceivableAllocation.findMany({
      where: {
        receivable: { orderId, kind: 'supply_deposit' },
        payment: {
          amount: { gt: 0 },
          status: { in: ['received', 'reconciled'] },
        },
      },
      include: { payment: true },
      orderBy: [{ payment: { createdAt: 'asc' } }, { paymentId: 'asc' }],
    });
    const byPayment = new Map<string, {
      payment: (typeof sourceAllocations)[number]['payment'];
      amount: number;
    }>();
    for (const allocation of sourceAllocations) {
      const current = byPayment.get(allocation.paymentId);
      if (current) current.amount += allocation.amount;
      else byPayment.set(allocation.paymentId, {
        payment: allocation.payment,
        amount: allocation.amount,
      });
    }
    const refundAllocations = [];
    let refundable = 0;
    for (const entry of byPayment.values()) {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${entry.payment.id} FOR UPDATE`;
      const prior = await tx.payment.aggregate({
        where: { originalPaymentId: entry.payment.id },
        _sum: { amount: true },
      });
      const capacity = Math.max(0, entry.payment.amount + (prior._sum.amount ?? 0));
      const amount = Math.min(entry.amount, capacity);
      if (amount === 0) continue;
      refundable += amount;
      refundAllocations.push({
        originalPaymentId: entry.payment.id,
        amount,
        methodSnapshot: entry.payment.method,
        shiftId: entry.payment.shiftId,
      });
    }
    if (refundable !== depositPaid) {
      throw new ConflictError(
        'cancellation_refund_allocation_mismatch',
        'Оплаченный задаток не сходится с доступными исходными платежами',
      );
    }
    const refund = await tx.refund.create({
      data: {
        purpose: 'customer_prepayment',
        orderId,
        idempotencyKey: `cancellation-refund:${cancellationId}`,
        requestHash,
        amount: depositPaid,
        status: 'approved',
        reason,
        requester: customerId,
        approver: 'system:pre-po-policy',
        approvedAt: new Date(),
        allocations: {
          create: refundAllocations.map((allocation, ordinal) => ({
            ...allocation,
            ordinal,
          })),
        },
      },
    });
    return tx.orderCancellation.update({
      where: { id: cancellationId },
      data: {
        status: 'refund_queued',
        approvedRefundAmount: depositPaid,
        refundId: refund.id,
      },
      select: PUBLIC_SELECT,
    });
  }
}

function cancellationPreview(order: CancellationSource) {
  const terminal = ['completed', 'cancelled', 'delivered', 'returned', 'refunded'].includes(order.status);
  const handedOver = order.items.some((item) => item.fulfillmentStatus === 'handed_over');
  const hasSupplyLines = order.items.some((item) => item.supplyModeSnapshot === 'to_order');
  const hasOwnStockLines = order.items.some((item) => (
    item.supplyModeSnapshot === 'own_stock'
    && !['cancelled', 'customer_cancelled', 'handed_over'].includes(item.fulfillmentStatus)
  ));
  const purchaseOrderSent = order.purchaseOrders.some((purchaseOrder) => purchaseOrder.sentAt !== null);
  const depositPaid = order.receivables.reduce(
    (sum, receivable) => sum + Math.min(receivable.settledAmount, receivable.amount),
    0,
  );
  const blockedReason = order.isDemo
    ? 'demo_order_blocked'
    : !hasSupplyLines
      ? 'supply_lines_required'
      : hasOwnStockLines
        ? 'mixed_cancellation_not_ready'
      : terminal
        ? 'order_already_terminal'
        : handedOver
          ? 'handed_over_items_require_return'
          : null;

  return {
    orderId: order.id,
    canCancel: blockedReason === null,
    blockedReason,
    policy: purchaseOrderSent ? 'owner_resolution' : 'automatic_full',
    purchaseOrderSent,
    depositPaid,
    estimatedRefundAmount: depositPaid,
    supplierExpenseDeduction: 0,
    ownerReviewRequired: purchaseOrderSent,
    note: purchaseOrderSent
      ? 'По умолчанию возврат полный; иная сумма требует решения владельца, причины и evidence.'
      : 'До отправки PO подтверждённый задаток возвращается полностью.',
  };
}

function replayCancellation(
  cancellation: Prisma.OrderCancellationGetPayload<{
    select: typeof PUBLIC_SELECT & {
      requestHash: true;
      customerIdSnapshot: true;
    };
  }>,
  orderId: string,
  customerId: string,
  requestHash: string,
) {
  if (
    cancellation.orderId !== orderId
    || cancellation.customerIdSnapshot !== customerId
    || cancellation.requestHash !== requestHash
  ) {
    throw new ConflictError(
      'idempotency_key_reused',
      'Idempotency-Key уже использован с другим запросом',
    );
  }
  const {
    requestHash: _requestHash,
    customerIdSnapshot: _customerIdSnapshot,
    ...publicCancellation
  } = cancellation;
  return publicCancellation;
}

function hashRequest(value: Record<string, string>) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function cancellationBlockedMessage(code: string | null) {
  switch (code) {
    case 'demo_order_blocked':
      return 'Демо-заказ нельзя отменить денежной операцией';
    case 'supply_lines_required':
      return 'Этот маршрут отмены доступен только для заказных товаров';
    case 'mixed_cancellation_not_ready':
      return 'Отмена смешанного заказа станет доступна после подключения частичной складской компенсации';
    case 'order_already_terminal':
      return 'Заказ уже завершён или отменён';
    case 'handed_over_items_require_return':
      return 'Выданный товар оформляется через возврат';
    default:
      return 'Заказ нельзя отменить';
  }
}
