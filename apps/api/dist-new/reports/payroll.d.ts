export interface PayrollConfig {
    base: number;
    commissionPct: number;
}
export declare const DEFAULT_PAYROLL: PayrollConfig;
export interface SellerInput {
    staffId: string;
    username?: string;
    revenue: number;
    sales: number;
}
export interface PayrollRow extends SellerInput {
    base: number;
    commission: number;
    total: number;
}
export interface Payroll {
    base: number;
    commissionPct: number;
    rows: PayrollRow[];
    totalPayout: number;
}
export declare function buildPayroll(sellers: SellerInput[], cfg?: PayrollConfig): Payroll;
