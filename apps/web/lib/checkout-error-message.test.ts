import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCustomer, createOrder } from './api/orders';

/**
 * Manual e2e finding. Guest checkout with a phone that already belongs to an
 * account answers 409 `guest_customer_requires_auth` with an actionable Russian
 * message ("Для этого номера войдите в аккаунт перед оформлением заказа"), but
 * `createCustomer` hand-rolled its own fetch and threw `customers responded 409`,
 * so the shopper saw an opaque technical string and never learned to log in.
 * Both order-path helpers now go through `postJson`, which surfaces the API's
 * own `message` (that is what every other client module already does).
 */
describe('checkout surfaces the API error message, not the raw status', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(status: number, body: unknown) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })));
  }

  it('createCustomer rethrows the 409 message from the API', async () => {
    stubFetch(409, {
      code: 'guest_customer_requires_auth',
      message: 'Для этого номера войдите в аккаунт перед оформлением заказа',
    });

    await expect(createCustomer({ phone: '+996700123456' }))
      .rejects.toThrow('Для этого номера войдите в аккаунт перед оформлением заказа');
  });

  it('createOrder rethrows the API message instead of "orders responded <status>"', async () => {
    stubFetch(409, { code: 'stock_conflict', message: 'Товара больше нет в наличии' });

    await expect(createOrder(
      { customerId: 'c1', channel: 'web', total: 100, items: [{ sku: 'A', qty: 1, price: 100 }] },
      'cap',
      'key-1',
    )).rejects.toThrow('Товара больше нет в наличии');
  });

  it('still fails loudly when the API sends no message body', async () => {
    stubFetch(500, {});
    await expect(createCustomer({ phone: '+996700000000' })).rejects.toThrow(/500/);
  });
});
