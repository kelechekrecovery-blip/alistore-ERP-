import { createHmac } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { SandboxPaymentGatewayProvider } from '../src/payments/sandbox-payment-gateway.provider';
import { selectPaymentGatewayProvider } from '../src/payments/payment-gateway-selector';

describe('sandbox webhook signatures', () => {
  const secret = 'staging-only-webhook-secret';
  const payload = JSON.stringify({
    orderId: 'order-1',
    method: 'card',
    amount: 1000,
    txnId: 'txn-1',
    status: 'succeeded',
  });
  const signature = createHmac('sha256', secret).update(payload).digest('hex');

  it('fails closed when the sandbox secret or signature is absent', async () => {
    const gateway = new SandboxPaymentGatewayProvider();

    await expect(gateway.verifyWebhook({
      payload: JSON.parse(payload),
      rawBody: Buffer.from(payload),
      headers: {},
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accepts an exact raw-body HMAC signature', async () => {
    const gateway = new SandboxPaymentGatewayProvider(secret);

    await expect(gateway.verifyWebhook({
      payload: JSON.parse(payload),
      rawBody: Buffer.from(payload),
      headers: { 'x-alistore-signature': `sha256=${signature}` },
    })).resolves.toMatchObject({ txnId: 'txn-1', status: 'succeeded' });
  });

  it('rejects a changed body even when the old signature is replayed', async () => {
    const gateway = new SandboxPaymentGatewayProvider(secret);

    await expect(gateway.verifyWebhook({
      payload: { ...JSON.parse(payload), amount: 9999 },
      rawBody: Buffer.from(JSON.stringify({ ...JSON.parse(payload), amount: 9999 })),
      headers: { 'x-alistore-signature': signature },
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('passes the configured secret from the environment selector', async () => {
    const gateway = selectPaymentGatewayProvider((name) => ({
      PAYMENT_PROVIDER: 'sandbox',
      PAYMENTS_SANDBOX_WEBHOOK_SECRET: secret,
    }[name]));

    await expect(gateway.verifyWebhook({
      payload: JSON.parse(payload),
      rawBody: Buffer.from(payload),
      headers: { 'x-alistore-signature': signature },
    })).resolves.toMatchObject({ txnId: 'txn-1' });
  });
});
