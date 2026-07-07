export interface TopProduct {
  sku: string;
  name: string;
  units: number;
  revenue: number;
}

export interface Kpi {
  revenue: number; // received/reconciled positive payments
  cogs: number; // cost of sold units
  grossMargin: number; // revenue − cogs
  marginPct: number; // 0–100, one decimal
  avgCheck: number; // revenue / paid orders
  paidOrders: number;
  topProducts: TopProduct[];
}

interface KpiInput {
  revenue: number;
  cogs: number;
  paidOrders: number;
  items: { sku: string; qty: number; price: number }[];
  names: Record<string, string>; // sku → product name
}

/**
 * Owner KPIs derived from ledger-backed figures: gross margin (revenue − COGS),
 * average check, and top products by revenue. Pure — all figures supplied by the
 * caller so the numbers can never diverge from the tables the ledger writes.
 */
export function buildKpi(input: KpiInput): Kpi {
  const { revenue, cogs, paidOrders, items, names } = input;
  const grossMargin = revenue - cogs;
  const marginPct = revenue > 0 ? Math.round((grossMargin / revenue) * 1000) / 10 : 0;
  const avgCheck = paidOrders > 0 ? Math.round(revenue / paidOrders) : 0;

  const byProduct = new Map<string, { units: number; revenue: number }>();
  for (const i of items) {
    const cur = byProduct.get(i.sku) ?? { units: 0, revenue: 0 };
    cur.units += i.qty;
    cur.revenue += i.price * i.qty;
    byProduct.set(i.sku, cur);
  }
  const topProducts: TopProduct[] = [...byProduct.entries()]
    .map(([sku, v]) => ({ sku, name: names[sku] ?? sku, units: v.units, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return { revenue, cogs, grossMargin, marginPct, avgCheck, paidOrders, topProducts };
}
