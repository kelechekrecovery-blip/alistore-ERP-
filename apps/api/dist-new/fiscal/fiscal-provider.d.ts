export type FiscalReceiptStatus = 'informational' | 'issued' | 'failed';
export interface FiscalReceiptRequest {
    orderId: string;
    total: number;
    operation: 'sale' | 'refund' | 'exchange';
}
export interface FiscalReceiptResult {
    status: FiscalReceiptStatus;
    fiscalNumber: string | null;
    qrPayload: string | null;
    providerReference: string | null;
}
export interface FiscalProvider {
    readonly name: string;
    readonly certified: boolean;
    issue(input: FiscalReceiptRequest): Promise<FiscalReceiptResult>;
}
export declare const INFORMATIONAL_FISCAL_PROVIDER: FiscalProvider;
