export interface TopProduct {
    sku: string;
    name: string;
    units: number;
    revenue: number;
}
export interface SellerKpi {
    staffId: string;
    revenue: number;
    sales: number;
}
export interface Kpi {
    revenue: number;
    cogs: number;
    grossMargin: number;
    marginPct: number;
    avgCheck: number;
    paidOrders: number;
    topProducts: TopProduct[];
    sellers: SellerKpi[];
}
interface KpiInput {
    revenue: number;
    cogs: number;
    paidOrders: number;
    productRows: Omit<TopProduct, 'name'>[];
    names: Record<string, string>;
    sellerRows: SellerKpi[];
}
export declare const TOP_PRODUCTS_LIMIT = 5;
export declare const TOP_SELLERS_LIMIT = 8;
export declare function buildKpi(input: KpiInput): Kpi;
export {};
