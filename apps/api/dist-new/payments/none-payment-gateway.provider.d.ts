import { GatewayCreateIntentInput, GatewayRefundInput, GatewayRefundResult, GatewayRefundWebhookPayload, GatewayRefundWebhookRequest, GatewayWebhookPayload, GatewayWebhookRequest, PaymentGatewayProvider, PaymentIntentView } from './payment-gateway-provider';
export declare class NonePaymentGatewayProvider implements PaymentGatewayProvider {
    readonly name: "none";
    assertOperational(): void;
    createIntent(_input: GatewayCreateIntentInput): Promise<PaymentIntentView>;
    verifyWebhook(_input: GatewayWebhookRequest): Promise<GatewayWebhookPayload>;
    verifyRefundWebhook(_input: GatewayRefundWebhookRequest): Promise<GatewayRefundWebhookPayload>;
    refund(_input: GatewayRefundInput): Promise<GatewayRefundResult>;
    private unavailable;
}
