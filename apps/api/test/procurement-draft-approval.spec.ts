import { ACTION_EXECUTORS } from '../src/approvals/action-executors';
import { FOUR_EYES_ACTIONS } from '../src/approvals/approvals.service';
import { canApprove } from '../src/rbac/permissions';

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
});
