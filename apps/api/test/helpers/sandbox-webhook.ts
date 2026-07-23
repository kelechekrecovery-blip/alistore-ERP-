import { createHmac } from 'node:crypto';
import type { PaymentWebhookDto } from '../../src/payments/payment-intents.dto';

export const SANDBOX_WEBHOOK_SECRET = 'integration-test-sandbox-webhook-secret';

export function signedSandboxWebhook(payload: PaymentWebhookDto) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = createHmac('sha256', SANDBOX_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return {
    rawBody,
    headers: { 'x-alistore-signature': `sha256=${signature}` },
  } as const;
}
