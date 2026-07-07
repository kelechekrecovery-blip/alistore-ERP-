import { suggestReorder } from '../src/ai/reorder';

/** Keyless restock rules (Phase 11): stock vs demand → reorder advice. */
describe('suggestReorder', () => {
  it('flags high urgency when out of stock with demand', () => {
    const r = suggestReorder({ inStock: 0, reserved: 0, soldUnits: 3 });
    expect(r.needsReorder).toBe(true);
    expect(r.urgency).toBe('high');
    expect(r.suggestedQty).toBe(3);
  });

  it('covers at least two units even for a single sale', () => {
    const r = suggestReorder({ inStock: 0, reserved: 0, soldUnits: 1 });
    expect(r.urgency).toBe('high');
    expect(r.suggestedQty).toBe(2);
  });

  it('flags high when nearly empty under strong demand', () => {
    const r = suggestReorder({ inStock: 1, reserved: 0, soldUnits: 5 });
    expect(r.urgency).toBe('high');
    expect(r.suggestedQty).toBe(4); // cover 5 − 1 on hand
  });

  it('flags medium when low with modest demand', () => {
    const r = suggestReorder({ inStock: 2, reserved: 0, soldUnits: 1 });
    expect(r.urgency).toBe('medium');
    expect(r.needsReorder).toBe(true);
  });

  it('flags medium when reservations exceed stock', () => {
    const r = suggestReorder({ inStock: 3, reserved: 5, soldUnits: 2 });
    expect(r.urgency).toBe('medium');
    expect(r.suggestedQty).toBe(2); // 5 reserved − 3 on hand
  });

  it('holds when stock is sufficient', () => {
    const r = suggestReorder({ inStock: 10, reserved: 0, soldUnits: 1 });
    expect(r.needsReorder).toBe(false);
    expect(r.urgency).toBe('none');
    expect(r.suggestedQty).toBe(0);
  });
});
