import { buildKpi } from '../src/reports/kpi';

/** Pure KPI math: gross margin, margin %, average check, top products by revenue. */
describe('buildKpi', () => {
  it('computes margin, average check and ranks top products by revenue', () => {
    const kpi = buildKpi({
      revenue: 100000,
      cogs: 60000,
      paidOrders: 4,
      items: [
        { sku: 'A', qty: 2, price: 20000 }, // 40000
        { sku: 'A', qty: 1, price: 20000 }, // +20000 → A: 60000, 3 units
        { sku: 'B', qty: 1, price: 30000 }, // 30000
      ],
      names: { A: 'Phone', B: 'Laptop' },
      sellerRows: [],
    });

    expect(kpi.grossMargin).toBe(40000);
    expect(kpi.marginPct).toBe(40);
    expect(kpi.avgCheck).toBe(25000);
    expect(kpi.topProducts[0]).toMatchObject({ sku: 'A', name: 'Phone', units: 3, revenue: 60000 });
    expect(kpi.topProducts[1]).toMatchObject({ sku: 'B', revenue: 30000 });
  });

  it('ranks sellers by revenue and counts their sales', () => {
    const kpi = buildKpi({
      revenue: 0, cogs: 0, paidOrders: 0, items: [], names: {},
      sellerRows: [
        { staffId: 'ann', amount: 50000 },
        { staffId: 'bob', amount: 30000 },
        { staffId: 'ann', amount: 20000 }, // ann: 70000 / 2 sales
      ],
    });
    expect(kpi.sellers[0]).toEqual({ staffId: 'ann', revenue: 70000, sales: 2 });
    expect(kpi.sellers[1]).toEqual({ staffId: 'bob', revenue: 30000, sales: 1 });
  });

  it('avoids divide-by-zero with no revenue or orders', () => {
    const kpi = buildKpi({ revenue: 0, cogs: 0, paidOrders: 0, items: [], names: {}, sellerRows: [] });
    expect(kpi.marginPct).toBe(0);
    expect(kpi.avgCheck).toBe(0);
    expect(kpi.topProducts).toEqual([]);
    expect(kpi.sellers).toEqual([]);
  });

  it('rounds margin percent to one decimal', () => {
    const kpi = buildKpi({ revenue: 30000, cogs: 20000, paidOrders: 1, items: [], names: {}, sellerRows: [] });
    expect(kpi.marginPct).toBe(33.3); // 10000/30000 = 33.33% → 33.3
  });
});
