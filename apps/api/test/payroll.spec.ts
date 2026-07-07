import { buildPayroll, DEFAULT_PAYROLL } from '../src/reports/payroll';

/** Seller payroll (Phase 9): base + commission on turnover. */
describe('buildPayroll', () => {
  it('adds base and commission on turnover per seller', () => {
    const p = buildPayroll([{ staffId: 's1', revenue: 200000, sales: 4 }]);
    const row = p.rows[0];
    expect(row.base).toBe(15000);
    expect(row.commission).toBe(3000); // 1.5% of 200000
    expect(row.total).toBe(18000);
  });

  it('ranks sellers by total pay, high first', () => {
    const p = buildPayroll([
      { staffId: 'low', revenue: 50000, sales: 1 },
      { staffId: 'high', revenue: 500000, sales: 9 },
    ]);
    expect(p.rows[0].staffId).toBe('high');
    expect(p.rows[1].staffId).toBe('low');
  });

  it('sums total payout across sellers', () => {
    const p = buildPayroll([
      { staffId: 'a', revenue: 100000, sales: 2 },
      { staffId: 'b', revenue: 100000, sales: 2 },
    ]);
    // each: 15000 + 1500 = 16500; two → 33000
    expect(p.totalPayout).toBe(33000);
  });

  it('pays base even with zero turnover', () => {
    const p = buildPayroll([{ staffId: 'idle', revenue: 0, sales: 0 }]);
    expect(p.rows[0].commission).toBe(0);
    expect(p.rows[0].total).toBe(DEFAULT_PAYROLL.base);
  });

  it('honours a custom comp config', () => {
    const p = buildPayroll([{ staffId: 's', revenue: 100000, sales: 1 }], { base: 20000, commissionPct: 3 });
    expect(p.rows[0].commission).toBe(3000);
    expect(p.rows[0].total).toBe(23000);
  });

  it('returns an empty roster cleanly', () => {
    const p = buildPayroll([]);
    expect(p.rows).toEqual([]);
    expect(p.totalPayout).toBe(0);
  });
});
