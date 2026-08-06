export declare class CreateDebtDto {
    orderId: string;
    principal: number;
    installments?: number;
    termDays?: number;
    reason?: string;
    idempotencyKey?: string;
    actor?: string;
}
export declare const DEBT_PAYMENT_METHODS: readonly ["cash", "card", "qr_mbank", "qr_odengi"];
export declare class DebtPaymentDto {
    amount: number;
    method?: (typeof DEBT_PAYMENT_METHODS)[number];
    idempotencyKey?: string;
    actor?: string;
}
