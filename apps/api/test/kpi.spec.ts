import { buildKpi, TOP_PRODUCTS_LIMIT, TOP_SELLERS_LIMIT } from '../src/reports/kpi';

/**
 * Чистая математика KPI: маржа, средний чек, ранжирование топа и продавцов.
 *
 * Сведение строк («сложить один SKU из разных заказов», «сложить платежи одного
 * продавца») переехало в БД — теперь это делает `ReportsService`, а покрывает
 * интеграционный тест в `reports.e2e-spec.ts`. Здесь остаётся то, что функция
 * действительно делает сама: ранжирует, отсекает хвост и подставляет имена.
 */
describe('buildKpi', () => {
  it('считает маржу, средний чек и ранжирует топ товаров по выручке', () => {
    const kpi = buildKpi({
      revenue: 100000,
      cogs: 60000,
      paidOrders: 4,
      productRows: [
        { sku: 'B', units: 1, revenue: 30000 },
        { sku: 'A', units: 3, revenue: 60000 },
      ],
      names: { A: 'Phone', B: 'Laptop' },
      sellerRows: [],
    });

    expect(kpi.grossMargin).toBe(40000);
    expect(kpi.marginPct).toBe(40);
    expect(kpi.avgCheck).toBe(25000);
    // Порядок задаётся выручкой, а не порядком строк на входе.
    expect(kpi.topProducts[0]).toEqual({ sku: 'A', name: 'Phone', units: 3, revenue: 60000 });
    expect(kpi.topProducts[1]).toEqual({ sku: 'B', name: 'Laptop', units: 1, revenue: 30000 });
  });

  it('подставляет SKU вместо имени, если карточка не найдена', () => {
    const kpi = buildKpi({
      revenue: 0,
      cogs: 0,
      paidOrders: 0,
      productRows: [{ sku: 'GHOST', units: 1, revenue: 1000 }],
      names: {},
      sellerRows: [],
    });
    // Придумывать имя нельзя: показываем то, что известно точно.
    expect(kpi.topProducts[0]).toEqual({ sku: 'GHOST', name: 'GHOST', units: 1, revenue: 1000 });
  });

  it('обрезает топ товаров и продавцов до предела', () => {
    const kpi = buildKpi({
      revenue: 0,
      cogs: 0,
      paidOrders: 0,
      productRows: Array.from({ length: TOP_PRODUCTS_LIMIT + 3 }, (_, index) => ({
        sku: `SKU-${index}`,
        units: 1,
        revenue: 1000 - index,
      })),
      names: {},
      sellerRows: Array.from({ length: TOP_SELLERS_LIMIT + 3 }, (_, index) => ({
        staffId: `staff-${index}`,
        revenue: 1000 - index,
        sales: 1,
      })),
    });
    expect(kpi.topProducts).toHaveLength(TOP_PRODUCTS_LIMIT);
    expect(kpi.sellers).toHaveLength(TOP_SELLERS_LIMIT);
    // Отсекается хвост, а не голова: самый выручковый обязан остаться.
    expect(kpi.topProducts[0].sku).toBe('SKU-0');
    expect(kpi.sellers[0].staffId).toBe('staff-0');
  });

  it('ранжирует продавцов по выручке', () => {
    const kpi = buildKpi({
      revenue: 0,
      cogs: 0,
      paidOrders: 0,
      productRows: [],
      names: {},
      sellerRows: [
        { staffId: 'bob', revenue: 30000, sales: 1 },
        { staffId: 'ann', revenue: 70000, sales: 2 },
      ],
    });
    expect(kpi.sellers[0]).toEqual({ staffId: 'ann', revenue: 70000, sales: 2 });
    expect(kpi.sellers[1]).toEqual({ staffId: 'bob', revenue: 30000, sales: 1 });
  });

  it('не делит на ноль при отсутствии выручки и заказов', () => {
    const kpi = buildKpi({ revenue: 0, cogs: 0, paidOrders: 0, productRows: [], names: {}, sellerRows: [] });
    expect(kpi.marginPct).toBe(0);
    expect(kpi.avgCheck).toBe(0);
    expect(kpi.topProducts).toEqual([]);
    expect(kpi.sellers).toEqual([]);
  });

  it('округляет процент маржи до одного знака', () => {
    const kpi = buildKpi({ revenue: 30000, cogs: 20000, paidOrders: 1, productRows: [], names: {}, sellerRows: [] });
    expect(kpi.marginPct).toBe(33.3); // 10000/30000 = 33.33% → 33.3
  });
});
