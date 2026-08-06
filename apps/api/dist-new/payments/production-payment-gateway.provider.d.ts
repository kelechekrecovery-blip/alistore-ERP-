import { GatewayCreateIntentInput, GatewayRefundInput, GatewayRefundResult, GatewayRefundWebhookPayload, GatewayRefundWebhookRequest, GatewayWebhookPayload, GatewayWebhookRequest, PaymentGatewayProvider, PaymentIntentView } from './payment-gateway-provider';
export interface ProductionPaymentGatewayOptions {
    apiUrl: string;
    merchantId: string;
    apiKey: string;
    webhookSecret: string;
}
export declare class ProductionPaymentGatewayProvider implements PaymentGatewayProvider {
    private readonly options;
    readonly name: "production";
    constructor(options: ProductionPaymentGatewayOptions);
    assertOperational(): void;
    createIntent(_input: GatewayCreateIntentInput): Promise<PaymentIntentView>;
    verifyWebhook(_input: GatewayWebhookRequest): Promise<GatewayWebhookPayload>;
    verifyRefundWebhook(_input: GatewayRefundWebhookRequest): Promise<GatewayRefundWebhookPayload>;
    refund(_input: GatewayRefundInput): Promise<GatewayRefundResult>;
    isConfigured(): boolean;
    private unavailable;
}
