export type PriceAction = 'raise' | 'hold' | 'discount';
export interface PriceInput {
    basePrice: number;
    inStock: number;
    soldUnits: number;
}
export interface PriceRec {
    current: number;
    suggested: number;
    deltaPct: number;
    action: PriceAction;
    reason: string;
}
export declare function suggestPrice(input: PriceInput): PriceRec;
