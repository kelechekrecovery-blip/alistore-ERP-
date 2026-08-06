export type TaxClassification = {
    taxCode: string;
    taxRateBps: number;
};
export type TaxableLine = TaxClassification & {
    lineNumber: number;
    grossAmount: number;
};
export type TaxLineSnapshot = TaxableLine & {
    discountAmount: number;
    taxBaseAmount: number;
    taxAmount: number;
};
export declare function salesTaxSnapshot(lines: TaxableLine[], finalMerchandiseAmount: number): {
    grossAmount: number;
    discountAmount: number;
    taxBaseAmount: number;
    taxAmount: number;
    lines: {
        taxCode: string;
        discountAmount: number;
        taxBaseAmount: number;
        taxAmount: number;
        taxRateBps: number;
        lineNumber: number;
        grossAmount: number;
    }[];
};
export declare function includedTax(grossAmount: number, taxRateBps: number): number;
export declare function cumulativeTaxDelta(totalTax: number, documentTotal: number, processedBefore: number, movementAmount: number): number;
export declare function outputTaxMetadata(lines: Array<TaxClassification & {
    taxAmount: number;
}>): {
    taxCode: string;
    taxRateBps: number;
};
export declare function assertTaxClassification(input: TaxClassification): void;
