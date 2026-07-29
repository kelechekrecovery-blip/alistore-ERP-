import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderLineSupplyStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const SUPPLY_OPERATION_QUEUE_KEYS = [
  'awaiting_deposit',
  'draft_po',
  'late',
  'received',
  'ready',
  'cancellation_awaiting_owner',
  'refund_failed',
] as const;

export type SupplyOperationQueueKey = (typeof SUPPLY_OPERATION_QUEUE_KEYS)[number];

type SupplyOperationRow = {
  id: string;
  queue: SupplyOperationQueueKey;
  orderId: string;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  status: string;
  amount: number | null;
  expectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sku: string | null;
  quantity: number | null;
  detailHref: string;
};

const SUPPLY_SELECT = {
  id: true,
  status: true,
  orderedQty: true,
  expectedAt: true,
  createdAt: true,
  updatedAt: true,
  orderItem: {
    select: {
      orderId: true,
      sku: true,
    },
  },
  purchaseOrderItem: {
    select: {
      purchaseOrder: {
        select: { id: true, number: true },
      },
    },
  },
} satisfies Prisma.OrderLineSupplySelect;

@Injectable()
export class SupplyOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(role: string | undefined, now = new Date()) {
    const financialQueuesVisible = role === 'owner' || role === 'admin';
    const [
      awaitingDeposit,
      draftPurchaseOrders,
      lateSupplies,
      receivedSupplies,
      readySupplies,
      cancellations,
      failedRefunds,
    ] = await Promise.all([
      this.prisma.orderReceivable.findMany({
        where: {
          kind: 'supply_deposit',
          status: { in: ['open', 'partially_settled'] },
          order: { isDemo: false },
        },
        select: {
          id: true,
          orderId: true,
          status: true,
          amount: true,
          settledAmount: true,
          dueAt: true,
          createdAt: true,
          updatedAt: true,
          orderItem: { select: { sku: true, qty: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      }),
      this.prisma.purchaseOrder.findMany({
        where: { status: 'draft', sourceOrderId: { not: null }, sourceOrder: { isDemo: false } },
        select: {
          id: true,
          number: true,
          sourceOrderId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          items: { select: { orderedQty: true, product: { select: { sku: true } } } },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      }),
      this.prisma.orderLineSupply.findMany({
        where: {
          OR: [
            { status: 'late' },
            { status: { in: ['ordered', 'in_transit'] }, expectedAt: { lt: now } },
          ],
          orderItem: { order: { isDemo: false } },
        },
        select: SUPPLY_SELECT,
        orderBy: [{ expectedAt: 'asc' }, { createdAt: 'asc' }],
        take: 100,
      }),
      this.prisma.orderLineSupply.findMany({
        where: {
          status: { in: ['received', 'quality_check'] },
          orderItem: { order: { isDemo: false } },
        },
        select: SUPPLY_SELECT,
        orderBy: { updatedAt: 'asc' },
        take: 100,
      }),
      this.prisma.orderLineSupply.findMany({
        where: {
          status: 'ready',
          orderItem: { order: { isDemo: false } },
        },
        select: SUPPLY_SELECT,
        orderBy: { updatedAt: 'asc' },
        take: 100,
      }),
      financialQueuesVisible
        ? this.prisma.orderCancellation.findMany({
            where: { status: 'awaiting_owner', order: { isDemo: false } },
            select: {
              id: true,
              orderId: true,
              status: true,
              requestedRefundAmount: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: 'asc' },
            take: 100,
          })
        : Promise.resolve([]),
      financialQueuesVisible
        ? this.prisma.orderCancellation.findMany({
            where: { status: 'refund_failed', order: { isDemo: false } },
            select: {
              id: true,
              orderId: true,
              status: true,
              approvedRefundAmount: true,
              requestedRefundAmount: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: 'asc' },
            take: 100,
          })
        : Promise.resolve([]),
    ]);

    const queues: Record<SupplyOperationQueueKey, SupplyOperationRow[]> = {
      awaiting_deposit: awaitingDeposit.map((receivable) => ({
        id: receivable.id,
        queue: 'awaiting_deposit',
        orderId: receivable.orderId,
        purchaseOrderId: null,
        purchaseOrderNumber: null,
        status: receivable.status,
        amount: financialQueuesVisible
          ? Math.max(0, receivable.amount - receivable.settledAmount)
          : null,
        expectedAt: receivable.dueAt,
        createdAt: receivable.createdAt,
        updatedAt: receivable.updatedAt,
        sku: receivable.orderItem?.sku ?? null,
        quantity: receivable.orderItem?.qty ?? null,
        detailHref: orderDetailHref(receivable.orderId),
      })),
      draft_po: draftPurchaseOrders.map((purchaseOrder) => ({
        id: purchaseOrder.id,
        queue: 'draft_po',
        orderId: purchaseOrder.sourceOrderId!,
        purchaseOrderId: purchaseOrder.id,
        purchaseOrderNumber: purchaseOrder.number,
        status: purchaseOrder.status,
        amount: null,
        expectedAt: null,
        createdAt: purchaseOrder.createdAt,
        updatedAt: purchaseOrder.updatedAt,
        sku: purchaseOrder.items[0]?.product.sku ?? null,
        quantity: purchaseOrder.items.reduce((sum, item) => sum + item.orderedQty, 0),
        detailHref: purchaseOrderDetailHref(purchaseOrder.id),
      })),
      late: lateSupplies.map((supply) => supplyRow('late', supply)),
      received: receivedSupplies.map((supply) => supplyRow('received', supply)),
      ready: readySupplies.map((supply) => supplyRow('ready', supply)),
      cancellation_awaiting_owner: cancellations.map((cancellation) => ({
        id: cancellation.id,
        queue: 'cancellation_awaiting_owner',
        orderId: cancellation.orderId,
        purchaseOrderId: null,
        purchaseOrderNumber: null,
        status: cancellation.status,
        amount: cancellation.requestedRefundAmount,
        expectedAt: null,
        createdAt: cancellation.createdAt,
        updatedAt: cancellation.updatedAt,
        sku: null,
        quantity: null,
        detailHref: cancellationDetailHref(cancellation.id),
      })),
      refund_failed: failedRefunds.map((cancellation) => ({
        id: cancellation.id,
        queue: 'refund_failed',
        orderId: cancellation.orderId,
        purchaseOrderId: null,
        purchaseOrderNumber: null,
        status: cancellation.status,
        amount: cancellation.approvedRefundAmount ?? cancellation.requestedRefundAmount,
        expectedAt: null,
        createdAt: cancellation.createdAt,
        updatedAt: cancellation.updatedAt,
        sku: null,
        quantity: null,
        detailHref: cancellationDetailHref(cancellation.id),
      })),
    };

    return {
      generatedAt: now,
      flags: {
        checkoutEnabled: enabled(this.config, 'TO_ORDER_CHECKOUT_ENABLED'),
        cancellationEnabled: enabled(this.config, 'SUPPLY_CANCELLATION_ENABLED'),
        autoRefundEnabled: enabled(this.config, 'SUPPLY_AUTO_REFUND_ENABLED'),
        ownerResolutionEnabled: enabled(this.config, 'SUPPLY_OWNER_RESOLUTION_ENABLED'),
      },
      capabilities: {
        financialQueuesVisible,
        ownerResolutionAvailable: role === 'owner' && enabled(this.config, 'SUPPLY_OWNER_RESOLUTION_ENABLED'),
      },
      counts: Object.fromEntries(
        SUPPLY_OPERATION_QUEUE_KEYS.map((key) => [key, queues[key].length]),
      ) as Record<SupplyOperationQueueKey, number>,
      queues,
    };
  }
}

function supplyRow(
  queue: Extract<SupplyOperationQueueKey, 'late' | 'received' | 'ready'>,
  supply: Prisma.OrderLineSupplyGetPayload<{ select: typeof SUPPLY_SELECT }>,
): SupplyOperationRow {
  const purchaseOrder = supply.purchaseOrderItem?.purchaseOrder ?? null;
  return {
    id: supply.id,
    queue,
    orderId: supply.orderItem.orderId,
    purchaseOrderId: purchaseOrder?.id ?? null,
    purchaseOrderNumber: purchaseOrder?.number ?? null,
    status: supply.status,
    amount: null,
    expectedAt: supply.expectedAt,
    createdAt: supply.createdAt,
    updatedAt: supply.updatedAt,
    sku: supply.orderItem.sku,
    quantity: supply.orderedQty,
    detailHref: purchaseOrder
      ? purchaseOrderDetailHref(purchaseOrder.id)
      : orderDetailHref(supply.orderItem.orderId),
  };
}

function enabled(config: ConfigService, key: string): boolean {
  return config.get<string>(key)?.trim().toLowerCase() === 'true';
}

function orderDetailHref(orderId: string): string {
  return `/erp?route=reorder&orderId=${encodeURIComponent(orderId)}`;
}

function purchaseOrderDetailHref(purchaseOrderId: string): string {
  return `/erp?route=reorder&purchaseOrderId=${encodeURIComponent(purchaseOrderId)}`;
}

function cancellationDetailHref(cancellationId: string): string {
  return `/erp?route=reorder&cancellationId=${encodeURIComponent(cancellationId)}`;
}
