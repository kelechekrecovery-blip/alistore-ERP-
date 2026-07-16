import {
  GatewayCreateIntentInput,
  GatewayRefundInput,
  GatewayRefundResult,
  GatewayRefundWebhookPayload,
  GatewayRefundWebhookRequest,
  GatewayWebhookPayload,
  GatewayWebhookRequest,
  PaymentGatewayProvider,
  PaymentIntentView,
  PaymentProviderName,
} from './payment-gateway-provider';
import { createHash } from 'node:crypto';

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
    const replayToken = input.idempotencyKey
      ? createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 16)
      : issuedAt.toString(36);
    const txnId = `${provider}-${input.orderId}-${replayToken}`;
    const intentId = `PI-${input.orderId.slice(-8).toUpperCase()}-${replayToken.toUpperCase()}`;
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

  async verifyRefundWebhook(input: GatewayRefundWebhookRequest): Promise<GatewayRefundWebhookPayload> {
    const payload = input.payload as Partial<GatewayRefundWebhookPayload>;
    if (!payload.providerRefundId || !['succeeded', 'failed'].includes(payload.status ?? '')) {
      throw new Error('invalid sandbox refund webhook');
    }
    return payload as GatewayRefundWebhookPayload;
  }

  private paymentUrl(provider: PaymentProviderName, intentId: string, returnUrl?: string): string {
    const base = `/api/sandbox/payments/${provider}/${intentId}`;
    return returnUrl ? `${base}?returnUrl=${encodeURIComponent(returnUrl)}` : base;
  }

  private qrPayload(provider: PaymentProviderName, orderId: string, amount: number, txnId: string): string | null {
    if (provider !== 'mbank' && provider !== 'odengi') return null;
    return `alistore-${provider}://pay?order=${encodeURIComponent(orderId)}&amount=${amount}&txn=${encodeURIComponent(txnId)}`;
  }
}
