import { FeatureFlagKey } from '../feature-flags/feature-flags.registry';
import type { FeatureFlagsService, FeatureFlagState } from '../feature-flags/feature-flags.service';
import { SupplyOperationsService } from './supply-operations.service';

describe('SupplyOperationsService', () => {
  it('maps all operational sources and exposes disabled release flags', async () => {
    const prisma = prismaMock({
      orderReceivables: [{
        id: 'receivable-1',
        orderId: 'order-1',
        status: 'partially_settled',
        amount: 20000,
        settledAmount: 5000,
        dueAt: null,
        createdAt: date(),
        updatedAt: date(),
        orderItem: { sku: 'SKU-1', qty: 1 },
      }],
      draftPurchaseOrders: [{
        id: 'po-1',
        number: 'PO-1',
        sourceOrderId: 'order-1',
        status: 'draft',
        createdAt: date(),
        updatedAt: date(),
        items: [{ orderedQty: 1, product: { sku: 'SKU-1' } }],
      }],
      supplyBatches: [
        [supply('late')],
        [supply('received')],
        [supply('ready')],
      ],
      cancellations: [
        [{
          id: 'cancel-1',
          orderId: 'order-1',
          status: 'awaiting_owner',
          requestedRefundAmount: 20000,
          createdAt: date(),
          updatedAt: date(),
        }],
        [{
          id: 'cancel-2',
          orderId: 'order-2',
          status: 'refund_failed',
          approvedRefundAmount: 10000,
          requestedRefundAmount: 12000,
          createdAt: date(),
          updatedAt: date(),
        }],
      ],
    });
    const service = new SupplyOperationsService(
      prisma as never,
      flagsService({ [FeatureFlagKey.Cancellation]: true }),
    );

    const result = await service.list('admin', date());

    expect(result.counts).toEqual({
      awaiting_deposit: 1,
      draft_po: 1,
      late: 1,
      received: 1,
      ready: 1,
      cancellation_awaiting_owner: 1,
      refund_failed: 1,
    });
    expect(result.queues.awaiting_deposit[0].amount).toBe(15000);
    expect(result.capabilities).toEqual({
      financialQueuesVisible: true,
      ownerResolutionAvailable: false,
    });
    expect(result.flags[FeatureFlagKey.ToOrderCheckout]).toMatchObject({ enabled: false, source: 'default' });
    expect(result.flags[FeatureFlagKey.Cancellation]).toMatchObject({ enabled: true, source: 'default' });
    expect(result.flags[FeatureFlagKey.AutoRefund]).toMatchObject({ enabled: false, source: 'default' });
    expect(result.flags[FeatureFlagKey.OwnerResolution]).toMatchObject({ enabled: false, source: 'default' });
  });

  it('does not query or return cancellation/refund finance queues to warehouse staff', async () => {
    const prisma = prismaMock({
      orderReceivables: [{
        id: 'receivable-private',
        orderId: 'order-private',
        status: 'open',
        amount: 50000,
        settledAmount: 0,
        dueAt: null,
        createdAt: date(),
        updatedAt: date(),
        orderItem: { sku: 'SKU-PRIVATE', qty: 1 },
      }],
      draftPurchaseOrders: [],
      supplyBatches: [[], [], []],
      cancellations: [],
    });
    const service = new SupplyOperationsService(prisma as never, flagsService({}));

    const result = await service.list('warehouse', date());

    expect(prisma.orderCancellation.findMany).not.toHaveBeenCalled();
    expect(result.capabilities.financialQueuesVisible).toBe(false);
    expect(result.queues.awaiting_deposit[0].amount).toBeNull();
    expect(result.queues.cancellation_awaiting_owner).toEqual([]);
    expect(result.queues.refund_failed).toEqual([]);
  });

  it('reports registry state and observes override/reset changes without a restart', async () => {
    const prisma = prismaMock({
      orderReceivables: [],
      draftPurchaseOrders: [],
      supplyBatches: [[], [], []],
      cancellations: [],
    });
    let source: FeatureFlagState['source'] = 'environment';
    let enabled = true;
    const flags = flagsService({}, () => ({ enabled, source }));
    const service = new SupplyOperationsService(prisma as never, flags);

    const deployState = await service.list('owner', date());
    expect(deployState.flags[FeatureFlagKey.ToOrderCheckout]).toMatchObject({ enabled: true, source: 'environment' });

    enabled = false;
    source = 'database';
    const overrideState = await service.list('owner', date());
    expect(overrideState.flags[FeatureFlagKey.ToOrderCheckout]).toMatchObject({ enabled: false, source: 'database' });

    enabled = true;
    source = 'environment';
    const resetState = await service.list('owner', date());
    expect(resetState.flags[FeatureFlagKey.ToOrderCheckout]).toMatchObject({ enabled: true, source: 'environment' });
    expect(flags.list).toHaveBeenCalledTimes(3);
  });
});

function flagsService(
  values: Partial<Record<FeatureFlagKey, boolean>>,
  state?: () => Pick<FeatureFlagState, 'enabled' | 'source'>,
): jest.Mocked<FeatureFlagsService> {
  const definitions = Object.values(FeatureFlagKey).map((key) => ({
    key,
    description: key,
    owner: 'supply',
    defaultEnabled: false as const,
    legacyEnv: key,
    enabled: values[key] ?? false,
    source: 'default' as const,
  }));
  return {
    isEnabled: jest.fn(async (key: FeatureFlagKey | string) => values[key as FeatureFlagKey] ?? false),
    list: jest.fn(async () => definitions.map((definition) => ({ ...definition, ...(state?.() ?? {}) }))),
  } as unknown as jest.Mocked<FeatureFlagsService>;
}

function date() {
  return new Date('2026-07-29T12:00:00.000Z');
}

function supply(status: string) {
  return {
    id: `supply-${status}`,
    status,
    orderedQty: 1,
    expectedAt: date(),
    createdAt: date(),
    updatedAt: date(),
    orderItem: { orderId: 'order-1', sku: 'SKU-1' },
    purchaseOrderItem: {
      purchaseOrder: { id: 'po-1', number: 'PO-1' },
    },
  };
}

function prismaMock(input: {
  orderReceivables: unknown[];
  draftPurchaseOrders: unknown[];
  supplyBatches: unknown[][];
  cancellations: unknown[][];
}) {
  let orderLineSupplyCall = 0;
  let cancellationCall = 0;
  return {
    orderReceivable: { findMany: jest.fn().mockResolvedValue(input.orderReceivables) },
    purchaseOrder: { findMany: jest.fn().mockResolvedValue(input.draftPurchaseOrders) },
    orderLineSupply: {
      findMany: jest.fn().mockImplementation((..._args: unknown[]) => {
        const call = orderLineSupplyCall++ % 3;
        return Promise.resolve(input.supplyBatches[call]);
      }),
    },
    orderCancellation: {
      findMany: jest.fn().mockImplementation((..._args: unknown[]) => {
        const call = cancellationCall++ % 2;
        return Promise.resolve(input.cancellations[call] ?? []);
      }),
    },
  };
}
