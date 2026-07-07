export interface TopProduct {
  sku: string;
  name: string;
  units: number;
  revenue: number;
}

export interface SellerKpi {
  staffId: string;
  revenue: number;
  sales: number; // number of payments taken
}

export interface Kpi {
  revenue: number; // received/reconciled positive payments
  cogs: number; // cost of sold units
  grossMargin: number; // revenue − cogs
  marginPct: number; // 0–100, one decimal
  avgCheck: number; // revenue / paid orders
  paidOrders: number;
  topProducts: TopProduct[];
  sellers: SellerKpi[]; // per-cashier performance (via shift.staffId)
}

interface KpiInput {
  revenue: number;
  cogs: number;
  paidOrders: number;
  items: { sku: string; qty: number; price: number }[];
  names: Record<string, string>; // sku → product name
  sellerRows: { staffId: string; amount: number }[]; // positive payments with a shift
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

  const bySeller = new Map<string, { revenue: number; sales: number }>();
  for (const s of input.sellerRows) {
    const cur = bySeller.get(s.staffId) ?? { revenue: 0, sales: 0 };
    cur.revenue += s.amount;
    cur.sales += 1;
    bySeller.set(s.staffId, cur);
  }
  const sellers: SellerKpi[] = [...bySeller.entries()]
    .map(([staffId, v]) => ({ staffId, revenue: v.revenue, sales: v.sales }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  return { revenue, cogs, grossMargin, marginPct, avgCheck, paidOrders, topProducts, sellers };
}
