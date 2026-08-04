#!/usr/bin/env node
/**
 * Make the storefront reviewable for App Review.
 *
 * App Review opens AliStore KG and has to be able to complete a purchase. The
 * production catalog currently returns four products with `availableUnits: 0`,
 * so the reviewer sees a store where nothing can be bought — a Guideline 2.1
 * rejection waiting to happen.
 *
 * This tops up stock for products that ALREADY EXIST, through the real API
 * (`POST /inventory/receive-quantity`), so every write goes through the Event
 * Ledger with an idempotency key like any other receipt. It never invents
 * products, prices or categories: fabricated catalog data would be a worse
 * problem than an empty catalog, and `scripts/check-no-fixtures.mjs` exists
 * precisely because that has happened before.
 *
 * Read-only by default.
 *
 *   node scripts/seed-review-data.mjs --api-base https://api.ali.kg/api --location BISHKEK-1
 *   node scripts/seed-review-data.mjs --api-base https://api.ali.kg/api --location BISHKEK-1 --apply --yes-production
 *
 * Auth (never passed on the command line, so it stays out of shell history):
 *   ALISTORE_SEED_TOKEN=<staff access token>          # preferred
 *   ALISTORE_SEED_USERNAME=... ALISTORE_SEED_SECRET=...  # falls back to staff-auth/login
 */
const DEFAULT_TARGET = 3;
const MIN_BUYABLE_PRODUCTS = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const CATALOG_PAGE_SIZE = 100;

/** Products a reviewer could actually put in a basket. */
export function summarizeStorefront(products) {
  const buyable = products.filter((product) => (product.availableUnits ?? 0) > 0).length;
  return { total: products.length, buyable, reviewable: buyable >= MIN_BUYABLE_PRODUCTS };
}

/**
 * Why there is nothing left to do. "Everything is already stocked but the
 * catalog is too small" and "some products cannot be seeded at all" need
 * different actions from the owner, and an ops tool that blurs them sends
 * someone hunting for a problem that is not there.
 */
export function explainNoWork({ summary, skipped }) {
  if (summary.reviewable) return { ok: true, message: '✓ Nothing to do — the storefront is already reviewable' };
  if (skipped.length > 0) {
    return { ok: false, message: `✗ ${skipped.length} product(s) cannot be topped up automatically — see above` };
  }
  return {
    ok: false,
    message: `✗ Every product is already stocked, but the catalog only has ${summary.total} `
      + `product(s) and App Review needs at least ${MIN_BUYABLE_PRODUCTS} buyable. `
      + 'Add real products to the catalog in the ERP — this script will not invent them.',
  };
}

/**
 * Deterministic, so re-running the seed cannot double-receive: the API dedupes
 * on this key. Keyed by target as well as product, because a later run with a
 * higher target is a genuinely different receipt.
 */
export function idempotencyKeyFor(productId, target) {
  return `review-seed:${productId}:${target}`;
}

/**
 * Only quantity-tracked products can be topped up this way. Serialized products
 * are backed by real IMEI units; inventing those would put fictional devices in
 * a real ledger, so they are reported and left alone.
 */
export function planStockTopUps(products, { target = DEFAULT_TARGET, collectSkipped = false } = {}) {
  const plan = [];
  const skipped = [];
  for (const product of products) {
    const current = product.availableUnits ?? 0;
    if (current >= target) continue;
    if (product.trackingMode !== 'quantity') {
      skipped.push({
        productId: product.id,
        name: product.name,
        reason: 'serialized product — needs real IMEI units, cannot be seeded',
      });
      continue;
    }
    plan.push({
      productId: product.id,
      name: product.name,
      current,
      quantity: target - current,
      idempotencyKey: idempotencyKeyFor(product.id, target),
    });
  }
  return collectSkipped ? { plan, skipped } : plan;
}

/** Writing to anything that is not the local API is an explicit decision. */
export function assertWritableTarget({ apiBase, confirmed }) {
  const { hostname } = new URL(apiBase);
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (!isLocal && !confirmed) {
    throw new Error(
      `${apiBase} is not a local API. Re-run with --yes-production to write to production data.`,
    );
  }
}

const isMain = process.argv[1]
  && (await import('node:path')).resolve(process.argv[1]) === (await import('node:url')).fileURLToPath(import.meta.url);
if (isMain) {
  // An operator running this against production should get a sentence, not a
  // Node stack trace, when the API is unreachable or refuses the request.
  try {
    await main();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const apiBase = (flag('--api-base') ?? '').replace(/\/$/u, '');
  const location = flag('--location');
  const target = Number(flag('--target', String(DEFAULT_TARGET)));
  const apply = args.includes('--apply');
  const confirmed = args.includes('--yes-production');

  if (!apiBase) fail('--api-base is required, e.g. --api-base https://api.ali.kg/api');
  if (!Number.isInteger(target) || target < 1) fail('--target must be a positive integer');
  if (apply && !location) fail('--location is required to write stock, e.g. --location BISHKEK-1');
  if (apply) {
    try {
      assertWritableTarget({ apiBase, confirmed });
    } catch (error) {
      fail(error.message);
    }
  }

  const call = async (method, path, { body, token } = {}) => {
    let response;
    try {
      response = await request(method, path, { body, token });
    } catch (error) {
      // Node's bare "fetch failed" does not say which host it could not reach,
      // which is the one thing the operator needs.
      const reason = error?.name === 'TimeoutError' ? `timed out after ${REQUEST_TIMEOUT_MS / 1000}s` : 'could not be reached';
      throw new Error(`${apiBase} ${reason} (${method} ${path})`);
    }
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${method} ${path} → HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    return text ? JSON.parse(text) : null;
  };

  const request = (method, path, { body, token } = {}) =>
    fetch(`${apiBase}${path}`, {
      method,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  // The catalog caps limit at 100, so page rather than assuming one request
  // covers the whole store.
  const catalog = async () => {
    const items = [];
    for (let offset = 0; ; offset += CATALOG_PAGE_SIZE) {
      const page = await call('GET', `/catalog/products?limit=${CATALOG_PAGE_SIZE}&offset=${offset}`);
      const batch = page.items ?? [];
      items.push(...batch);
      if (batch.length < CATALOG_PAGE_SIZE || items.length >= (page.total ?? items.length)) break;
    }
    return items;
  };

  const before = await catalog();
  const summaryBefore = summarizeStorefront(before);
  console.log(
    `Storefront: ${summaryBefore.total} product(s), ${summaryBefore.buyable} buyable — `
    + (summaryBefore.reviewable ? 'reviewable' : `NOT reviewable (need ${MIN_BUYABLE_PRODUCTS})`),
  );

  const { plan, skipped } = planStockTopUps(before, { target, collectSkipped: true });
  for (const item of skipped) console.log(`  ! ${item.name}: ${item.reason}`);
  if (plan.length === 0) {
    const verdict = explainNoWork({ summary: summaryBefore, skipped });
    console.log(verdict.message);
    process.exit(verdict.ok ? 0 : 1);
  }

  for (const item of plan) {
    console.log(`  ${apply ? '→' : '·'} ${item.name}: ${item.current} → ${target} (+${item.quantity})`);
  }
  if (!apply) {
    console.log(`\n${plan.length} product(s) would be topped up at location <${location ?? 'REQUIRED'}>.`);
    console.log('Re-run with --location <branch> --apply (plus --yes-production for a remote API) to write.');
    return;
  }

  const token = await resolveToken(call);
  for (const item of plan) {
    await call('POST', '/inventory/receive-quantity', {
      token,
      body: {
        idempotencyKey: item.idempotencyKey,
        productId: item.productId,
        location,
        quantity: item.quantity,
        reason: 'App Review demo stock',
      },
    });
    console.log(`  ✓ ${item.name} received ${item.quantity} at ${location}`);
  }

  const after = summarizeStorefront(await catalog());
  console.log(`\nStorefront now: ${after.buyable}/${after.total} buyable — ${after.reviewable ? '✓ reviewable' : '✗ still not reviewable'}`);
  process.exit(after.reviewable ? 0 : 1);
}

async function resolveToken(call) {
  const token = process.env.ALISTORE_SEED_TOKEN?.trim();
  if (token) return token;
  const username = process.env.ALISTORE_SEED_USERNAME?.trim();
  const secret = process.env.ALISTORE_SEED_SECRET;
  if (!username || !secret) {
    fail('Set ALISTORE_SEED_TOKEN, or ALISTORE_SEED_USERNAME and ALISTORE_SEED_SECRET, to authenticate');
  }
  const session = await call('POST', '/staff-auth/login', { body: { username, password: secret } });
  return session.accessToken;
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}
