/**
 * LOGIC-003 / CHECKOUT-KEY. Stable idempotency keys for web checkout.
 *
 * place() used to mint a fresh crypto.randomUUID() on every attempt, so a retry after a
 * dropped network created a second order for the same cart — and gift-card money settled
 * on the orphaned first one. The order key is instead derived from the cart snapshot:
 * identical across retries of the same checkout, different the moment anything the
 * customer picked actually changes. The payment intent key is derived from the created
 * order, method and due amount for the same reason.
 */

export interface CheckoutSnapshotItem {
  sku: string;
  qty: number;
  price: number;
}

export interface CheckoutSnapshot {
  /** Stable customer identity: account id for signed-in users, phone for guests. */
  customer: string;
  fulfillmentType: string;
  storePointId: string;
  deliveryAddress: string;
  deliveryZoneId: string;
  deliverySlotId: string;
  /** Total the customer confirmed, delivery fee included — captures promo/bonus changes. */
  payableTotal: number;
  /** Rotation seed, bumped after a successful placement so a re-filled cart gets a fresh key. */
  attempt: number;
  items: CheckoutSnapshotItem[];
}

/** Stable stringify: object keys sorted recursively, array order preserved. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, field]) => field !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`);
  return `{${entries.join(',')}}`;
}

/**
 * Canonical form of a checkout snapshot. Cart lines are sorted so the key describes the
 * cart's composition — the same lines in a different order are the same order.
 */
export function canonicalCheckoutSnapshot(snapshot: CheckoutSnapshot): string {
  const items = [...snapshot.items].sort((a, b) =>
    a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : a.price - b.price,
  );
  return canonicalJson({ ...snapshot, items });
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Idempotency key for order creation: a digest of the canonical cart snapshot. */
export async function checkoutOrderKey(snapshot: CheckoutSnapshot): Promise<string> {
  return `web-order-${await sha256Hex(canonicalCheckoutSnapshot(snapshot))}`;
}

/**
 * Idempotency key for the payment intent. The order already exists by this point, so the
 * key binds to it — a retry asks for the same intent, a different amount asks for a new one.
 */
export function paymentIntentKey(orderId: string, method: string, amount: number): string {
  return `web-intent-${orderId}-${method}-${amount}`;
}
