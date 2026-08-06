export interface MarginControlLine {
    productId: string;
    sku: string;
    qty: number;
    price: number;
    cost: number;
    costRef?: string;
}
export interface MarginBreach {
    productId: string;
    sku: string;
    qty: number;
    price: number;
    cost: number;
    discountedPrice: number;
    margin: number;
    minMargin: number;
}
export interface MarginControlResult {
    gross: number;
    total: number;
    discountAmount: number;
    minMargin: number;
    worstMargin: number;
    breaches: MarginBreach[];
    fingerprint: string;
}
export declare function saleTotal(lines: Array<{
    price: number;
    qty: number;
}>, discountPct: number): number;
export declare function evaluateMarginControl(lines: MarginControlLine[], discountPct: number, minMargin: number): MarginControlResult;
