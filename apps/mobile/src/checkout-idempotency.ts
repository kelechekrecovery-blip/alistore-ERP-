/**
 * LOGIC-012. Stable POS idempotency keys for the native staff sale.
 *
 * completeSale() used to mint `mobile-<staff>-<Date.now()>` on every attempt, so a
 * retry after a dropped network posted a second sale for the same cart. The key is
 * instead derived from the cart snapshot (same approach as the web checkout in
 * apps/web/lib/checkout-idempotency.ts): identical across retries of the same sale,
 * different the moment anything the cashier picked actually changes. The attempt
 * counter is bumped after a successful sale, so a re-filled identical cart is a new
 * sale with a fresh key.
 *
 * crypto.subtle is unavailable in the Hermes runtime, so the digest uses a pure-JS
 * 106-bit hash (two cyrb53 passes with different seeds) instead of SHA-256.
 */

export interface PosSaleSnapshotLine {
  productId: string;
  sku: string;
  qty: number;
  price: number;
}

export interface PosSaleSnapshot {
  staffId: string;
  point: string;
  discountPct: number;
  /** Total the cashier confirmed — captures discount/price changes. */
  total: number;
  /** Rotation seed, bumped after a successful sale so a re-filled cart gets a fresh key. */
  attempt: number;
  lines: PosSaleSnapshotLine[];
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
 * Canonical form of a sale snapshot. Cart lines are sorted so the key describes the
 * cart's composition — the same lines in a different order are the same sale.
 */
export function canonicalSaleSnapshot(snapshot: PosSaleSnapshot): string {
  const lines = [...snapshot.lines].sort((a, b) =>
    a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : a.price - b.price,
  );
  return canonicalJson({ ...snapshot, lines });
}

/** cyrb53 (c) bryc — Public domain. Deterministic 53-bit hash, no runtime deps. */
function cyrb53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Idempotency key for a POS sale: a digest of the canonical cart snapshot. */
export function posSaleKey(snapshot: PosSaleSnapshot): string {
  const canonical = canonicalSaleSnapshot(snapshot);
  const digest =
    cyrb53(canonical, 0).toString(16).padStart(14, '0') +
    cyrb53(canonical, 1).toString(16).padStart(14, '0');
  return `mobile-${snapshot.staffId}-${digest}`;
}
