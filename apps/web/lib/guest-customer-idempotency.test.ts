import { describe, expect, it } from 'vitest';
import { guestCustomerAttempt, stableIdempotencyAttempt } from './guest-customer-idempotency';

describe('guest customer attempt key', () => {
  it('reuses an unguessable key for the same payload and rotates after edits', () => {
    let sequence = 0;
    const createKey = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
    const first = guestCustomerAttempt(null, { phone: '+996700000001', name: 'A' }, createKey);
    const retry = guestCustomerAttempt(first, { phone: '996700000001', name: ' A ' }, createKey);
    const changed = guestCustomerAttempt(retry, { phone: '+996700000001', name: 'B' }, createKey);
    expect(retry).toBe(first);
    expect(changed.key).not.toBe(first.key);
  });

  it('keeps the order key while rotating only the intent key after a payment-method edit', () => {
    let sequence = 0;
    const createKey = () => `key-${++sequence}`;
    const orderInput = { customer: '+996700000001', items: [{ sku: 'A', qty: 1 }] };
    const firstOrder = stableIdempotencyAttempt(null, orderInput, createKey);
    const firstIntent = stableIdempotencyAttempt(null, { orderId: 'order-1', method: 'card', amount: 100 }, createKey);

    const retriedOrder = stableIdempotencyAttempt(firstOrder, orderInput, createKey);
    const retriedIntent = stableIdempotencyAttempt(firstIntent, { orderId: 'order-1', method: 'card', amount: 100 }, createKey);
    const changedIntent = stableIdempotencyAttempt(retriedIntent, { orderId: 'order-1', method: 'qr_mbank', amount: 100 }, createKey);

    expect(retriedOrder).toBe(firstOrder);
    expect(retriedIntent).toBe(firstIntent);
    expect(changedIntent.key).not.toBe(firstIntent.key);
    expect(retriedOrder.key).toBe(firstOrder.key);
  });
});
