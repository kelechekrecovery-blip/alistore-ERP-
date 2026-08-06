export declare const ONLINE_PAYMENT_METHODS: readonly ["card", "qr_mbank", "qr_odengi", "installment"];
export declare class CreatePaymentIntentDto {
    orderId: string;
    method: (typeof ONLINE_PAYMENT_METHODS)[number];
    amount: number;
    returnUrl?: string;
    actor?: string;
}
export declare class PaymentWebhookDto {
    method: (typeof ONLINE_PAYMENT_METHODS)[number];
    orderId: string;
    amount: number;
    txnId: string;
    status: 'succeeded' | 'failed';
    actor?: string;
}
