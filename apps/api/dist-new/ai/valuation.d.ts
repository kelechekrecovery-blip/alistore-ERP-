export type DeviceGrade = 'A' | 'B' | 'C';
export interface ValuationInput {
    basePrice: number;
    grade: DeviceGrade;
    ageMonths: number;
    defects: string[];
}
export interface Valuation {
    basePrice: number;
    resale: number;
    buyback: number;
    retainedPct: number;
    factors: {
        age: number;
        grade: number;
        defect: number;
    };
    notes: string[];
}
export declare const DEFAULT_BUYBACK_OF_RESALE = 0.7;
export declare function assessDevice(input: ValuationInput, buybackOfResale?: number): Valuation;
