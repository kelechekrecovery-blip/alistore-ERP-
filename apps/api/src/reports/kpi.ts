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
  /** Уже сведённые строки «товар → штуки и выручка»; ранжирование здесь. */
  productRows: Omit<TopProduct, 'name'>[];
  names: Record<string, string>; // sku → product name
  /** Уже сведённые строки «продавец → выручка и число продаж». */
  sellerRows: SellerKpi[];
}

export const TOP_PRODUCTS_LIMIT = 5;
export const TOP_SELLERS_LIMIT = 8;

/**
 * Owner KPIs derived from ledger-backed figures: gross margin (revenue − COGS),
 * average check, and top products by revenue. Pure — all figures supplied by the
 * caller so the numbers can never diverge from the tables the ledger writes.
 *
 * Сведение по товарам и продавцам делает вызывающий: раньше сюда приезжала вся
 * история `orderItem` и `payment`, и кокпит владельца перебирал её в памяти при
 * каждом открытии. Здесь остаётся только ранжирование и отсечение хвоста.
 */
export function buildKpi(input: KpiInput): Kpi {
  const { revenue, cogs, paidOrders, productRows, names } = input;
  const grossMargin = revenue - cogs;
  const marginPct = revenue > 0 ? Math.round((grossMargin / revenue) * 1000) / 10 : 0;
  const avgCheck = paidOrders > 0 ? Math.round(revenue / paidOrders) : 0;

  const topProducts: TopProduct[] = [...productRows]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, TOP_PRODUCTS_LIMIT)
    .map((row) => ({ ...row, name: names[row.sku] ?? row.sku }));

  const sellers: SellerKpi[] = [...input.sellerRows]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, TOP_SELLERS_LIMIT);

  return { revenue, cogs, grossMargin, marginPct, avgCheck, paidOrders, topProducts, sellers };
}
