import { API_BASE, postAuthJson } from './http';

export interface CatalogProduct {
  id: string;
  sku: string;
  barcode?: string | null;
  variantGroup?: string | null;
  name: string;
  price: number;
  category: string;
  trackingMode?: 'serialized' | 'quantity';
  attrs: Record<string, unknown> | null;
  bundleComponents?: Array<{ productId: string; sku: string; name: string; qty: number }>;
  availableUnits: number;
  reviewCount: number;
  avgRating: number | null;
  updatedAt?: string;
}

export interface CatalogResponse {
  source: string;
  warning?: string;
  total: number;
  limit: number;
  offset: number;
  items: CatalogProduct[];
}

export interface CatalogDeltaResponse {
  cursor: string;
  since?: string;
  changed: CatalogProduct[];
  removed: string[];
  totalChanged: number;
  totalRemoved: number;
  truncated: boolean;
}

export interface CatalogQuery {
  q?: string;
  category?: string;
  stockOnly?: boolean;
  limit?: number;
  offset?: number;
  sort?: 'name' | 'price_asc' | 'price_desc' | 'stock_desc';
}

/**
 * Fetch the storefront catalog from the API. Never throws to the render tree —
 * on failure it returns an empty result so the page degrades gracefully.
 */
export async function fetchCatalog(query: CatalogQuery = {}): Promise<CatalogResponse> {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.category) params.set('category', query.category);
  if (query.stockOnly) params.set('stockOnly', 'true');
  if (query.sort) params.set('sort', query.sort);
  params.set('limit', String(query.limit ?? 24));
  params.set('offset', String(query.offset ?? 0));

  try {
    const res = await fetch(`${API_BASE}/catalog/products?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`catalog responded ${res.status}`);
    return (await res.json()) as CatalogResponse;
  } catch {
    // Мягкий отказ намеренный: серверные компоненты и офлайн-касса не должны
    // падать из-за недоступного каталога. Но `source` здесь — не украшение, а
    // единственный признак, по которому вызывающий отличит «товаров нет» от
    // «мы не смогли спросить». Долгое время его не читал никто, и покупатель
    // видел пустой магазин вместо сообщения о неполадке. Проверяйте
    // `isCatalogUnavailable` везде, где показываете результат человеку.
    return { source: CATALOG_UNAVAILABLE, total: 0, limit: 0, offset: 0, items: [] };
  }
}

/** Ответ каталога, полученный не с сервера, а из аварийной ветки клиента. */
export const CATALOG_UNAVAILABLE = 'unavailable';

export class CatalogUnavailableError extends Error {
  constructor(message = 'Каталог временно недоступен') {
    super(message);
    this.name = 'CatalogUnavailableError';
  }
}

/** Отличить «каталог пуст» от «каталог не ответил». */
export function isCatalogUnavailable(response: { source: string }): boolean {
  return response.source === CATALOG_UNAVAILABLE;
}

export async function fetchCatalogDelta(
  since?: string,
  limit = 500,
): Promise<CatalogDeltaResponse | null> {
  const params = new URLSearchParams();
  if (since) params.set('since', since);
  params.set('limit', String(limit));

  try {
    const res = await fetch(`${API_BASE}/catalog/products/delta?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`catalog delta responded ${res.status}`);
    return (await res.json()) as CatalogDeltaResponse;
  } catch {
    return null;
  }
}

const POS_CATALOG_CACHE_KEY = 'alistore.pos.catalogCache.v1';

export interface PosCatalogCache {
  cursor: string;
  updatedAt: string;
  items: CatalogProduct[];
}

export interface PosCatalogSyncResult {
  catalog: CatalogResponse;
  source: 'network_full' | 'network_delta' | 'cache' | 'unavailable';
  changed: number;
  removed: number;
  cursor?: string;
  warning?: string;
}

export function loadPosCatalogCache(): PosCatalogCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(POS_CATALOG_CACHE_KEY);
    return raw ? (JSON.parse(raw) as PosCatalogCache) : null;
  } catch {
    return null;
  }
}

export function savePosCatalogCache(cache: PosCatalogCache): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(POS_CATALOG_CACHE_KEY, JSON.stringify(cache));
}

export async function syncPosCatalogCache(
  query: CatalogQuery = { limit: 100 },
): Promise<PosCatalogSyncResult> {
  const cached = loadPosCatalogCache();
  if (cached?.cursor) {
    const delta = await fetchCatalogDelta(cached.cursor);
    if (delta) {
      const items = mergeCatalogDelta(cached.items, delta);
      const next = { cursor: delta.cursor, updatedAt: new Date().toISOString(), items };
      savePosCatalogCache(next);
      return {
        catalog: {
          source: 'pos_cache_delta',
          total: items.length,
          limit: items.length,
          offset: 0,
          items,
        },
        source: 'network_delta',
        changed: delta.totalChanged,
        removed: delta.totalRemoved,
        cursor: delta.cursor,
        warning: delta.truncated ? 'catalog_delta_truncated' : undefined,
      };
    }
    return {
      catalog: {
        source: 'pos_cache',
        total: cached.items.length,
        limit: cached.items.length,
        offset: 0,
        items: cached.items,
      },
      source: 'cache',
      changed: 0,
      removed: 0,
      cursor: cached.cursor,
      warning: 'catalog_delta_unavailable',
    };
  }

  const catalog = await fetchCatalog(query);
  if (catalog.items.length > 0) {
    const cursor = new Date().toISOString();
    savePosCatalogCache({ cursor, updatedAt: cursor, items: catalog.items });
    return { catalog, source: 'network_full', changed: catalog.items.length, removed: 0, cursor };
  }
  return { catalog, source: 'unavailable', changed: 0, removed: 0 };
}

function mergeCatalogDelta(
  current: CatalogProduct[],
  delta: CatalogDeltaResponse,
): CatalogProduct[] {
  const removed = new Set(delta.removed);
  const byId = new Map(
    current
      .filter((item) => !removed.has(item.id))
      .map((item) => [item.id, item]),
  );
  for (const item of delta.changed) {
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => {
    const category = a.category.localeCompare(b.category, 'ru');
    return category || a.name.localeCompare(b.name, 'ru');
  });
}

/**
 * Fetch a single product by id. The catalog has no by-id endpoint yet, so we pull
 * a page and match locally — fine for the MVP catalog size; swap for a dedicated
 * endpoint when the catalog grows.
 */
export async function fetchProduct(id: string): Promise<CatalogProduct | null> {
  try {
    const res = await fetch(`${API_BASE}/catalog/products/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`product responded ${res.status}`);
    const result = (await res.json()) as ProductWithRelated;
    return result.product;
  } catch (error) {
    if (error instanceof CatalogUnavailableError) throw error;
    throw new CatalogUnavailableError();
  }
}

export interface ProductWithRelated {
  product: CatalogProduct | null;
  variants: CatalogProduct[];
  related: CatalogProduct[];
}

export interface ProductReview {
  id: string;
  rating: number;
  text: string | null;
  customerName: string;
  createdAt: string;
}

export interface ProductReviews {
  productId: string;
  sku: string;
  count: number;
  avgRating: number | null;
  items: ProductReview[];
}

const PRODUCT_DETAIL_CACHE_MS = 30_000;
const productDetailCache = new Map<string, { expiresAt: number; promise: Promise<ProductWithRelated> }>();

/**
 * Product detail payload for the mobile storefront. Uses one catalog request for
 * MVP scale and derives same-category recommendations locally.
 */
export async function fetchProductWithRelated(id: string, relatedLimit = 6): Promise<ProductWithRelated> {
  // Product ids are CUIDs. Avoid a predictable validation request for malformed
  // deep links so the not-found screen stays a clean, client-visible state.
  if (!/^c[a-z0-9]{24}$/.test(id)) return { product: null, variants: [], related: [] };
  const cacheKey = `${id}:${relatedLimit}`;
  const now = Date.now();
  const cached = productDetailCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = fetchProductWithRelatedUncached(id, relatedLimit);
  productDetailCache.set(cacheKey, { expiresAt: now + PRODUCT_DETAIL_CACHE_MS, promise });
  promise.catch(() => productDetailCache.delete(cacheKey));
  return promise;
}

async function fetchProductWithRelatedUncached(id: string, relatedLimit: number): Promise<ProductWithRelated> {
  try {
    const res = await fetch(`${API_BASE}/catalog/products/${encodeURIComponent(id)}?relatedLimit=${relatedLimit}`, { cache: 'no-store' });
    if (res.status === 404) return { product: null, variants: [], related: [] };
    if (!res.ok) throw new CatalogUnavailableError(`Товар временно недоступен (${res.status})`);
    return (await res.json()) as ProductWithRelated;
  } catch (error) {
    if (error instanceof CatalogUnavailableError) throw error;
    throw new CatalogUnavailableError();
  }
}

export async function fetchCatalogCategories(): Promise<Array<{ category: string; count: number }>> {
  try {
    const res = await fetch(`${API_BASE}/catalog/categories`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`categories responded ${res.status}`);
    return (await res.json()) as Array<{ category: string; count: number }>;
  } catch {
    return [];
  }
}

export async function fetchProductReviews(id: string): Promise<ProductReviews> {
  const res = await fetch(`${API_BASE}/products/${encodeURIComponent(id)}/reviews`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`reviews responded ${res.status}`);
  return (await res.json()) as ProductReviews;
}

export function createProductReview(
  productId: string,
  input: { rating: number; text?: string },
  accessToken: string,
): Promise<ProductReview> {
  return postAuthJson(`/products/${encodeURIComponent(productId)}/reviews`, input, accessToken);
}
