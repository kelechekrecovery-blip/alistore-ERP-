import { describe, expect, it } from 'vitest';
import {
  canonicalCheckoutSnapshot,
  canonicalJson,
  checkoutOrderKey,
  paymentIntentKey,
  type CheckoutSnapshot,
} from './checkout-idempotency';

/**
 * LOGIC-003 / CHECKOUT-KEY. The checkout page used to mint a fresh crypto.randomUUID()
 * order key on every place() attempt, so a retry after a dropped network created a second
 * order for the same cart — and gift-card money settled on the orphaned first one. The key
 * must instead be derived from the cart snapshot: identical across retries of the same
 * checkout, different the moment anything the customer picked actually changes.
 */
const baseSnapshot = (): CheckoutSnapshot => ({
  customer: '+996700123456',
  fulfillmentType: 'courier',
  storePointId: '',
  deliveryAddress: 'Бишкек, ул. Киевская 95, кв. 12',
  deliveryZoneId: 'zone-center',
  deliverySlotId: 'slot-10-12',
  payableTotal: 1250,
  attempt: 0,
  items: [
    { sku: 'IP15-128-BLK', qty: 1, price: 1000 },
    { sku: 'CASE-IP15-CLR', qty: 2, price: 125 },
  ],
});

describe('checkoutOrderKey (LOGIC-003)', () => {
  it('is deterministic: the same snapshot yields the same key on every attempt', async () => {
    const first = await checkoutOrderKey(baseSnapshot());
    const second = await checkoutOrderKey(baseSnapshot());
    expect(first).toBe(second);
  });

  it('is stable across retries that rebuild the snapshot from scratch', async () => {
    // A retry after a network failure re-derives the snapshot from component state;
    // nothing about the key may depend on object identity or key ordering.
    const attemptOne = await checkoutOrderKey(baseSnapshot());
    const rebuilt = baseSnapshot();
    rebuilt.items = [rebuilt.items[1], rebuilt.items[0]];
    const attemptTwo = await checkoutOrderKey({ ...rebuilt, items: [...rebuilt.items].reverse() });
    expect(attemptTwo).toBe(attemptOne);
  });

  it('looks like an idempotency key: prefixed, lowercase hex digest', async () => {
    const key = await checkoutOrderKey(baseSnapshot());
    expect(key).toMatch(/^web-order-[0-9a-f]{64}$/);
  });

  it('changes when the cart composition changes', async () => {
    const base = await checkoutOrderKey(baseSnapshot());
    const added = baseSnapshot();
    added.items.push({ sku: 'GLASS-IP15', qty: 1, price: 300 });
    expect(await checkoutOrderKey(added)).not.toBe(base);

    const removed = baseSnapshot();
    removed.items = removed.items.slice(0, 1);
    expect(await checkoutOrderKey(removed)).not.toBe(base);
  });

  it('changes when a quantity or a price changes', async () => {
    const base = await checkoutOrderKey(baseSnapshot());
    const moreQty = baseSnapshot();
    moreQty.items = [{ ...moreQty.items[0], qty: 2 }, moreQty.items[1]];
    expect(await checkoutOrderKey(moreQty)).not.toBe(base);

    const otherPrice = baseSnapshot();
    otherPrice.items = [otherPrice.items[0], { ...otherPrice.items[1], price: 130 }];
    expect(await checkoutOrderKey(otherPrice)).not.toBe(base);
  });

  it('changes with the fulfilment choices: point, address, zone, slot, method', async () => {
    const base = await checkoutOrderKey(baseSnapshot());
    expect(await checkoutOrderKey({ ...baseSnapshot(), fulfillmentType: 'pickup', storePointId: 'sp-1', deliveryAddress: '', deliveryZoneId: '', deliverySlotId: '' })).not.toBe(base);
    expect(await checkoutOrderKey({ ...baseSnapshot(), storePointId: 'sp-2' })).not.toBe(base);
    expect(await checkoutOrderKey({ ...baseSnapshot(), deliveryAddress: 'Бишкек, ул. Логвиненко 5' })).not.toBe(base);
    expect(await checkoutOrderKey({ ...baseSnapshot(), deliveryZoneId: 'zone-north' })).not.toBe(base);
    expect(await checkoutOrderKey({ ...baseSnapshot(), deliverySlotId: 'slot-14-16' })).not.toBe(base);
  });

  it('changes with the customer and with the payable total', async () => {
    const base = await checkoutOrderKey(baseSnapshot());
    expect(await checkoutOrderKey({ ...baseSnapshot(), customer: '+996555000111' })).not.toBe(base);
    // Promo or bonus toggled between attempts: the money changed, so the order must not
    // replay under the old key.
    expect(await checkoutOrderKey({ ...baseSnapshot(), payableTotal: 1100 })).not.toBe(base);
  });

  it('rotates when the attempt seed is bumped after a successful placement', async () => {
    const base = await checkoutOrderKey(baseSnapshot());
    const rotated = await checkoutOrderKey({ ...baseSnapshot(), attempt: 1 });
    expect(rotated).not.toBe(base);
    expect(await checkoutOrderKey({ ...baseSnapshot(), attempt: 1 })).toBe(rotated);
  });

  it('does not collide between different customers buying the identical cart', async () => {
    const guest = await checkoutOrderKey(baseSnapshot());
    const account = await checkoutOrderKey({ ...baseSnapshot(), customer: 'customer-42' });
    expect(account).not.toBe(guest);
  });
});

describe('canonicalCheckoutSnapshot', () => {
  it('ignores object key order and cart line order', () => {
    const a = baseSnapshot();
    const b: CheckoutSnapshot = {
      attempt: 0,
      payableTotal: 1250,
      deliverySlotId: 'slot-10-12',
      deliveryZoneId: 'zone-center',
      deliveryAddress: 'Бишкек, ул. Киевская 95, кв. 12',
      storePointId: '',
      fulfillmentType: 'courier',
      customer: '+996700123456',
      items: [
        { sku: 'CASE-IP15-CLR', qty: 2, price: 125 },
        { sku: 'IP15-128-BLK', qty: 1, price: 1000 },
      ],
    };
    expect(canonicalCheckoutSnapshot(b)).toBe(canonicalCheckoutSnapshot(a));
  });
});

describe('canonicalJson', () => {
  it('sorts object keys recursively while keeping array order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    expect(canonicalJson({ list: [{ y: 1, x: 2 }] })).toBe('{"list":[{"x":2,"y":1}]}');
  });
});

describe('paymentIntentKey', () => {
  it('is deterministic and bound to order, method and amount', () => {
    const key = paymentIntentKey('order-1', 'qr_mbank', 900);
    expect(paymentIntentKey('order-1', 'qr_mbank', 900)).toBe(key);
    expect(paymentIntentKey('order-2', 'qr_mbank', 900)).not.toBe(key);
    expect(paymentIntentKey('order-1', 'card', 900)).not.toBe(key);
    // A different due amount (gift card applied, promo re-quoted) must not replay the old intent.
    expect(paymentIntentKey('order-1', 'qr_mbank', 1000)).not.toBe(key);
  });
});
