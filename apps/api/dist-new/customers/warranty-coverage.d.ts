export declare const WARRANTY_COVERAGE_MONTHS = 12;
export declare function warrantyCoverage(purchasedAt: Date | undefined, now?: Date, coverageMonths?: number): {
    until: Date;
    daysLeft: number;
} | null;
