import {
  GatewayCreateIntentInput,
  GatewayRefundInput,
  GatewayRefundResult,
  GatewayWebhookPayload,
  GatewayWebhookRequest,
  PaymentGatewayProvider,
  PaymentIntentView,
  PaymentProviderName,
} from './payment-gateway-provider';

const PROVIDER: Record<GatewayCreateIntentInput['method'], PaymentProviderName> = {
  card: 'card',
  qr_mbank: 'mbank',
  qr_odengi: 'odengi',
  installment: 'installment',
};

export class SandboxPaymentGatewayProvider implements PaymentGatewayProvider {
  readonly name = 'sandbox' as const;

  assertOperational(): void {}

  async createIntent(input: GatewayCreateIntentInput): Promise<PaymentIntentView> {
    const provider = PROVIDER[input.method];
    const issuedAt = Date.now();
    const txnId = `${provider}-${input.orderId}-${issuedAt}`;
    const intentId = `PI-${input.orderId.slice(-8).toUpperCase()}-${issuedAt.toString(36).toUpperCase()}`;
    const expiresAt = new Date(issuedAt + 15 * 60 * 1000).toISOString();
    return {
      intentId,
      provider,
      orderId: input.orderId,
      orderStatus: input.orderStatus,
      method: input.method,
      amount: input.amount,
      txnId,
      status: 'requires_action',
      expiresAt,
      paymentUrl: this.paymentUrl(provider, intentId, input.returnUrl),
      qrPayload: this.qrPayload(provider, input.orderId, input.amount, txnId),
    };
  }

  async verifyWebhook(input: GatewayWebhookRequest): Promise<GatewayWebhookPayload> {
    return input.payload;
  }

  async refund(input: GatewayRefundInput): Promise<GatewayRefundResult> {
    return { providerRefundId: `sandbox-refund-${input.idempotencyKey}`, status: 'succeeded' };
  }

  private paymentUrl(provider: PaymentProviderName, intentId: string, returnUrl?: string): string {
    const base = `/sandbox/payments/${provider}/${intentId}`;
    return returnUrl ? `${base}?returnUrl=${encodeURIComponent(returnUrl)}` : base;
  }

  private qrPayload(provider: PaymentProviderName, orderId: string, amount: number, txnId: string): string | null {
    if (provider !== 'mbank' && provider !== 'odengi') return null;
    return `alistore-${provider}://pay?order=${encodeURIComponent(orderId)}&amount=${amount}&txn=${encodeURIComponent(txnId)}`;
  }
}
