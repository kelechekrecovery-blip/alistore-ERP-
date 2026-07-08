import { buildRiskSignals, computeMarginLeaks } from '../src/reports/risk-signals';

/** Loss-prevention risk detectors (Phase 8, schema-free). */
const base = {
  cashDiscrepancies: [],
  codOutstanding: [],
  staleReservations: 0,
  pendingApprovals: [],
  warrantyOverdue: [],
  rmaOverdue: [],
  debtsOverdue: [],
  ticketsOverdue: [],
  marginLeaks: [],
  soldWithoutOrderImeis: [],
  imeiReuse: [],
};
const now = new Date('2026-07-07T00:00:00Z');

describe('buildRiskSignals', () => {
  it('is empty when nothing is wrong', () => {
    expect(buildRiskSignals(base, now)).toEqual([]);
  });

  it('flags a below-cost sale as a margin leak (medium)', () => {
    const s = buildRiskSignals(
      { ...base, marginLeaks: [{ sku: 'IPH', name: 'iPhone 15', price: 90000, cost: 100000 }] },
      now,
    );
    const leak = s.find((x) => x.kind === 'margin_leak');
    expect(leak?.severity).toBe('medium');
    expect(leak?.ref).toBe('IPH');
    expect(leak?.detail).toContain('iPhone 15');
    expect(leak?.detail).toContain('90000');
  });

  it('flags sold units with no order as a stock≠money mismatch (high) and names the IMEIs', () => {
    const s = buildRiskSignals({ ...base, soldWithoutOrderImeis: ['IMEI-A', 'IMEI-B', 'IMEI-C'] }, now);
    const mm = s.find((x) => x.kind === 'stock_money_mismatch');
    expect(mm?.severity).toBe('high');
    expect(mm?.detail).toContain('3');
    expect(mm?.detail).toContain('IMEI-A');
    expect(mm?.ref).toBe('IMEI-A');
  });

  it('flags an IMEI present in both a buyback and a sale as reuse (high)', () => {
    const s = buildRiskSignals({ ...base, imeiReuse: ['359-DUP-1'] }, now);
    const reuse = s.find((x) => x.kind === 'imei_reuse');
    expect(reuse?.severity).toBe('high');
    expect(reuse?.ref).toBe('359-DUP-1');
    expect(reuse?.detail).toContain('359-DUP-1');
  });

  it('omits the mismatch signal when zero units are affected', () => {
    const s = buildRiskSignals({ ...base, soldWithoutOrderImeis: [] }, now);
    expect(s.some((x) => x.kind === 'stock_money_mismatch')).toBe(false);
  });

  it('ranks the high-severity mismatch before the medium leak', () => {
    const s = buildRiskSignals(
      { ...base, soldWithoutOrderImeis: ['I1'], marginLeaks: [{ sku: 'Y', name: 'Z', price: 1, cost: 2 }] },
      now,
    );
    expect(s[0].kind).toBe('stock_money_mismatch');
    expect(s[0].severity).toBe('high');
  });
});

describe('computeMarginLeaks', () => {
  const products = [
    { sku: 'A', name: 'Phone A', cost: 100 },
    { sku: 'B', name: 'Phone B', cost: 200 },
  ];

  it('flags only paid lines priced below cost', () => {
    const leaks = computeMarginLeaks([{ sku: 'A', price: 90 }, { sku: 'B', price: 250 }], products);
    expect(leaks).toEqual([{ sku: 'A', name: 'Phone A', price: 90, cost: 100 }]);
  });

  it('keeps the worst (lowest) price per SKU', () => {
    const leaks = computeMarginLeaks([{ sku: 'A', price: 95 }, { sku: 'A', price: 80 }], products);
    expect(leaks).toHaveLength(1);
    expect(leaks[0].price).toBe(80);
  });

  it('ignores items with no matching product and honours the cap', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ sku: `S${i}`, price: 1 }));
    const manyProducts = many.map((m) => ({ sku: m.sku, name: m.sku, cost: 100 }));
    expect(computeMarginLeaks([{ sku: 'GHOST', price: 1 }], products)).toEqual([]);
    expect(computeMarginLeaks(many, manyProducts, 10)).toHaveLength(10);
  });
});
