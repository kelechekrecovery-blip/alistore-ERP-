import { suggestPrice } from '../src/ai/pricing';

/** Keyless dynamic-pricing rules (Phase 11): stock vs demand → price nudge. */
describe('suggestPrice', () => {
  it('raises price when scarce and in demand', () => {
    const r = suggestPrice({ basePrice: 100000, inStock: 1, soldUnits: 5 });
    expect(r.action).toBe('raise');
    expect(r.deltaPct).toBe(5);
    expect(r.suggested).toBe(105000);
  });

  it('discounts hard when overstocked with zero sales', () => {
    const r = suggestPrice({ basePrice: 100000, inStock: 12, soldUnits: 0 });
    expect(r.action).toBe('discount');
    expect(r.deltaPct).toBe(-10);
    expect(r.suggested).toBe(90000);
  });

  it('nudges down a slow, cold mover', () => {
    const r = suggestPrice({ basePrice: 50000, inStock: 6, soldUnits: 0 });
    expect(r.action).toBe('discount');
    expect(r.deltaPct).toBe(-5);
    expect(r.suggested).toBe(47500);
  });

  it('holds a balanced product', () => {
    const r = suggestPrice({ basePrice: 80000, inStock: 3, soldUnits: 4 });
    expect(r.action).toBe('hold');
    expect(r.deltaPct).toBe(0);
    expect(r.suggested).toBe(80000);
  });

  it('rounds suggestions to the nearest 100 and never goes negative', () => {
    const r = suggestPrice({ basePrice: 99, inStock: 20, soldUnits: 0 });
    expect(r.suggested % 100).toBe(0);
    expect(r.suggested).toBeGreaterThanOrEqual(0);
  });
});
