import { GatewayCreateIntentInput, GatewayRefundInput, GatewayRefundResult, GatewayRefundWebhookPayload, GatewayRefundWebhookRequest, GatewayWebhookPayload, GatewayWebhookRequest, PaymentGatewayProvider, PaymentIntentView } from './payment-gateway-provider';
export declare class SandboxPaymentGatewayProvider implements PaymentGatewayProvider {
    private readonly webhookSecret;
    readonly name: "sandbox";
    constructor(webhookSecret?: string);
    assertOperational(): void;
    createIntent(input: GatewayCreateIntentInput): Promise<PaymentIntentView>;
    verifyWebhook(input: GatewayWebhookRequest): Promise<GatewayWebhookPayload>;
    refund(input: GatewayRefundInput): Promise<GatewayRefundResult>;
    verifyRefundWebhook(input: GatewayRefundWebhookRequest): Promise<GatewayRefundWebhookPayload>;
    private assertWebhookSignature;
    private paymentUrl;
    private qrPayload;
}
