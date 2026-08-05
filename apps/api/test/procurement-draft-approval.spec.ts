import { ACTION_EXECUTORS } from '../src/approvals/action-executors';
import { ApprovalsService, FOUR_EYES_ACTIONS } from '../src/approvals/approvals.service';
import { canApprove } from '../src/rbac/permissions';
import { ReorderController } from '../src/ai/reorder.controller';

describe('approval-bound procurement drafts', () => {
  it('registers procurement_draft as a four-eyes admin/owner action', () => {
    expect(FOUR_EYES_ACTIONS).toContain('procurement_draft');
    expect(canApprove('procurement_draft', 'admin')).toBe(true);
    expect(canApprove('procurement_draft', 'owner')).toBe(true);
    expect(canApprove('procurement_draft', 'warehouse')).toBe(false);
  });

  it('creates a draft PO only inside the approved action executor', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'po-1', number: 'PO-TEST' });
    const tx = {
      storePoint: { findFirst: jest.fn().mockResolvedValue({ inventoryLocation: 'BISHKEK-1' }) },
      supplier: { findUnique: jest.fn().mockResolvedValue({ id: 'supplier-1' }) },
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'product-1', sku: 'SKU-1', _count: { bundleComponents: 0 } }]) },
      purchaseOrder: { create },
    } as any;
    const events: any[] = [];

    await ACTION_EXECUTORS.procurement_draft(tx, {
      idempotencyKey: 'approved-reorder-1', supplierId: 'supplier-1', location: 'BISHKEK-1',
      note: 'Approved by owner', items: [{ productId: 'product-1', qty: 4, unitCost: 120_000 }],
    }, 'owner-1', 'approval-1', events);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ idempotencyKey: 'approved-reorder-1', createdBy: 'owner-1', supplierId: 'supplier-1', location: 'BISHKEK-1' }),
    }));
    expect(events).toEqual([expect.objectContaining({
      type: 'purchase_order.created', payload: expect.objectContaining({ approvalId: 'approval-1', source: 'ai.reorder' }),
    })]);
  });

  it('rejects malformed draft rows before any PO write', async () => {
    const create = jest.fn();
    const tx = {
      storePoint: { findFirst: jest.fn() }, supplier: { findUnique: jest.fn() }, product: { findMany: jest.fn() },
      purchaseOrder: { create },
    } as any;
    await expect(ACTION_EXECUTORS.procurement_draft(tx, {
      idempotencyKey: 'bad', supplierId: 'supplier-1', location: 'BISHKEK-1', items: [{ productId: 'product-1', qty: 0, unitCost: 1 }],
    }, 'owner-1', 'approval-1', [])).rejects.toMatchObject({ code: 'procurement_draft_snapshot_invalid' });
    expect(create).not.toHaveBeenCalled();
  });

  it('fails closed when an approved procurement action has no parked snapshot', async () => {
    const updateMany = jest.fn();
    const tx = {
      $queryRaw: jest.fn(),
      approval: {
        findUnique: jest.fn().mockResolvedValue({ id: 'approval-1', action: 'procurement_draft', status: 'requested', evidence: null }),
        updateMany,
      },
    } as any;
    const audit = { transaction: (work: (value: any) => unknown) => work(tx) } as any;
    const service = new ApprovalsService({} as any, audit);

    await expect(service.decide('approval-1', { status: 'approved', approver: 'owner-1', approverRole: 'owner' }))
      .rejects.toMatchObject({ code: 'procurement_draft_snapshot_missing' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('parks a fresh server-side reorder snapshot in the approval inbox', async () => {
    const request = jest.fn().mockResolvedValue({ approvalId: 'approval-2', status: 'requested' });
    const controller = new ReorderController(
      { review: jest.fn().mockResolvedValue({
        source: 'rules', generatedForCount: 1, needsReorder: 1,
        reviews: [{ productId: 'product-1', sku: 'SKU-1', name: 'Phone', category: 'phones', inStock: 0, reserved: 0, soldUnits: 4, needsReorder: true, urgency: 'high', suggestedQty: 4, reason: 'stockout' }],
      }) } as any,
      { request } as any,
    );

    await expect(controller.requestDraftApproval({ customerId: 'staff-1' } as any, {
      idempotencyKey: 'approval-key-1', supplierId: 'supplier-1', location: 'BISHKEK-1', unitCosts: { 'product-1': 120_000 }, reason: 'Owner review',
    })).resolves.toEqual({ approvalId: 'approval-2', status: 'requested' });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      action: 'procurement_draft', requester: 'staff-1', idempotencyKey: 'approval-key-1',
      payload: expect.objectContaining({ items: [{ productId: 'product-1', qty: 4, unitCost: 120_000 }] }),
    }));
  });
});
