import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSupplyOperations,
  visibleSupplyOperationRows,
  type SupplyOperationsReport,
} from './procurement';

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('supply operations API', () => {
  it('uses the protected read-only procurement endpoint', async () => {
    const response = report();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSupplyOperations('staff-token')).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/procurement/supply-operations'),
      expect.objectContaining({
        headers: { authorization: 'Bearer staff-token' },
        cache: 'no-store',
      }),
    );
  });

  it('filters by order, PO and SKU without changing server counters', () => {
    const data = report();
    data.queues.draft_po = [
      row('draft-1', 'draft_po', 'order-alpha', 'PO-1042', 'IP17-BLK'),
      row('draft-2', 'draft_po', 'order-beta', 'PO-1043', 'MBA-M4'),
    ];
    data.counts.draft_po = 2;

    expect(visibleSupplyOperationRows(data, 'draft_po', '1042')).toHaveLength(1);
    expect(visibleSupplyOperationRows(data, 'draft_po', 'mba')).toHaveLength(1);
    expect(visibleSupplyOperationRows(data, 'draft_po', 'order-beta')).toHaveLength(1);
    expect(data.counts.draft_po).toBe(2);
  });
});

function report(): SupplyOperationsReport {
  const queues = {
    awaiting_deposit: [],
    draft_po: [],
    late: [],
    received: [],
    ready: [],
    cancellation_awaiting_owner: [],
    refund_failed: [],
  } satisfies SupplyOperationsReport['queues'];
  return {
    generatedAt: '2026-07-29T12:00:00.000Z',
    flags: Object.fromEntries([
      'supply.to_order_checkout',
      'supply.cancellation',
      'supply.auto_refund',
      'supply.owner_resolution',
      'supply.partial_handover',
      'supply.quarantine_conversion',
    ].map((key) => [key, {
      key,
      description: key,
      owner: 'supply',
      defaultEnabled: false,
      legacyEnv: key,
      enabled: false,
      source: 'default',
    }])) as SupplyOperationsReport['flags'],
    capabilities: { financialQueuesVisible: true, ownerResolutionAvailable: false },
    counts: {
      awaiting_deposit: 0,
      draft_po: 0,
      late: 0,
      received: 0,
      ready: 0,
      cancellation_awaiting_owner: 0,
      refund_failed: 0,
    },
    queues,
  };
}

function row(
  id: string,
  queue: 'draft_po',
  orderId: string,
  purchaseOrderNumber: string,
  sku: string,
) {
  return {
    id,
    queue,
    orderId,
    purchaseOrderId: id,
    purchaseOrderNumber,
    status: 'draft',
    amount: null,
    expectedAt: null,
    createdAt: '2026-07-29T12:00:00.000Z',
    updatedAt: '2026-07-29T12:00:00.000Z',
    sku,
    quantity: 1,
    detailHref: `/erp?route=reorder&purchaseOrderId=${id}`,
  };
}
