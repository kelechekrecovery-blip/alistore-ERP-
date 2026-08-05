import { buildReorderDraft } from '../src/ai/reorder-draft';

describe('buildReorderDraft', () => {
  const reviews = [
    { productId: 'p-out', sku: 'OUT', needsReorder: true, suggestedQty: 4 },
    { productId: 'p-safe', sku: 'SAFE', needsReorder: false, suggestedQty: 0 },
  ];

  it('creates a pure procurement payload only for flagged items', () => {
    expect(buildReorderDraft({
      idempotencyKey: 'ai-reorder-1', supplierId: 'supplier-1', location: 'BISHKEK-1', reviews,
      unitCosts: { 'p-out': 120_000 }, note: 'Owner review: urgent stockout',
    })).toEqual({
      idempotencyKey: 'ai-reorder-1', supplierId: 'supplier-1', location: 'BISHKEK-1',
      note: 'Owner review: urgent stockout', items: [{ productId: 'p-out', qty: 4, unitCost: 120_000 }],
    });
  });

  it('fails closed when a human has not supplied a unit cost', () => {
    expect(() => buildReorderDraft({
      idempotencyKey: 'ai-reorder-2', supplierId: 'supplier-1', location: 'BISHKEK-1', reviews,
      unitCosts: {},
    })).toThrow('reorder_unit_cost_required:OUT');
  });

  it('does not manufacture a purchase order from an empty recommendation', () => {
    expect(() => buildReorderDraft({
      idempotencyKey: 'ai-reorder-3', supplierId: 'supplier-1', location: 'BISHKEK-1',
      reviews: [reviews[1]], unitCosts: {},
    })).toThrow('reorder_draft_empty');
  });
});
