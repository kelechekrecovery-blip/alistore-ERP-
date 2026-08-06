export declare const TERM_LADDER: readonly [3, 6, 12];
export interface InstallmentPlan {
    id: string;
    label: string;
    maxMonths: number;
    markupBps: number;
    limitSom: number;
}
export interface InstallmentOffer {
    id: string;
    label: string;
    months: number;
    monthlySom: number;
    totalSom: number;
}
export declare function installmentOffers(priceSom: number, plans: readonly InstallmentPlan[]): InstallmentOffer[];
export interface InstallmentStep {
    months: number;
    monthlySom: number;
    providers: string[];
}
export declare function installmentLadder(priceSom: number, plans: readonly InstallmentPlan[]): InstallmentStep[];
export declare function bestInstallmentOffer(priceSom: number, plans: readonly InstallmentPlan[]): InstallmentOffer | null;
