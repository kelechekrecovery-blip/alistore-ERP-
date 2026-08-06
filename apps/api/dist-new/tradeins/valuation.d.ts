export declare const TRADE_IN_GRADES: readonly ["A", "B", "C"];
export type TradeInGrade = (typeof TRADE_IN_GRADES)[number];
export interface TradeInTier {
    match: string;
    baseSom: number;
}
export interface TradeInValuation {
    tiers: TradeInTier[];
    defaultBaseSom: number;
    gradeFactorsBps: Record<TradeInGrade, number>;
    roundToSom: number;
}
export declare function tradeInEstimate(model: string, grade: TradeInGrade, valuation: TradeInValuation): number;
