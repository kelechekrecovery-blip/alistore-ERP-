import { describe, expect, it } from 'vitest';

import { stableIdempotencyAttempt } from './idempotency-attempt';

describe('mobile checkout idempotency attempts', () => {
  it('reuses customer and order keys while rotating only a changed payment intent', () => {
    let sequence = 0;
    const createKey = () => `key-${++sequence}`;
    const customerInput = { phone: '+996700000001', name: 'Клиент' };
    const orderInput = { customer: customerInput, items: [{ sku: 'A', qty: 1 }] };

    const customer = stableIdempotencyAttempt(null, customerInput, createKey);
    const order = stableIdempotencyAttempt(null, orderInput, createKey);
    const intent = stableIdempotencyAttempt(null, { orderId: 'order-1', method: 'card', amount: 100 }, createKey);

    expect(stableIdempotencyAttempt(customer, customerInput, createKey)).toBe(customer);
    expect(stableIdempotencyAttempt(order, orderInput, createKey)).toBe(order);
    expect(stableIdempotencyAttempt(intent, { orderId: 'order-1', method: 'card', amount: 100 }, createKey)).toBe(intent);
    expect(stableIdempotencyAttempt(intent, { orderId: 'order-1', method: 'qr_mbank', amount: 100 }, createKey).key)
      .not.toBe(intent.key);
    expect(order.key).toBe('key-2');
  });
});
