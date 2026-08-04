import { selectPaymentGatewayProvider } from '../src/payments/payment-gateway-selector';
import { ProductionPaymentGatewayProvider } from '../src/payments/production-payment-gateway.provider';
import { SandboxPaymentGatewayProvider } from '../src/payments/sandbox-payment-gateway.provider';

describe('Payment gateway selector', () => {
  const select = (values: Record<string, string> = {}) =>
    selectPaymentGatewayProvider((name) => values[name]);

  it('uses sandbox only when payment env is absent or explicitly sandbox', () => {
    expect(select()).toBeInstanceOf(SandboxPaymentGatewayProvider);
    expect(select({ PAYMENT_PROVIDER: 'sandbox' })).toBeInstanceOf(SandboxPaymentGatewayProvider);
  });

  it('fails closed for unknown mode or incomplete production credentials', () => {
    expect(() => select({ PAYMENT_PROVIDER: 'unknown' })).toThrow('Unsupported PAYMENT_PROVIDER');
    expect(() => select({ PAYMENT_PROVIDER: 'production', PAYMENT_API_KEY: 'secret' }))
      .toThrow('Incomplete production payment configuration');
  });

  it('selects the fail-visible production adapter only for a complete env set', () => {
    const provider = select({
      PAYMENT_PROVIDER: 'production',
      PAYMENT_API_URL: 'https://payments.example.test',
      PAYMENT_MERCHANT_ID: 'merchant',
      PAYMENT_API_KEY: 'secret',
      PAYMENT_WEBHOOK_SECRET: 'webhook-secret',
    });
    expect(provider).toBeInstanceOf(ProductionPaymentGatewayProvider);
    expect(provider.name).toBe('production');
  });
});
