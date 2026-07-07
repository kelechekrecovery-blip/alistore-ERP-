import { API_BASE } from './http';

export interface CatalogProduct {
  id: string;
  sku: string;
  name: string;
  price: number;
  category: string;
  attrs: Record<string, unknown> | null;
  availableUnits: number;
}

export interface CatalogResponse {
  source: string;
  warning?: string;
  total: number;
  limit: number;
  offset: number;
  items: CatalogProduct[];
}

export interface CatalogQuery {
  q?: string;
  category?: string;
  stockOnly?: boolean;
  limit?: number;
  offset?: number;
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
  params.set('limit', String(query.limit ?? 24));
  params.set('offset', String(query.offset ?? 0));

  try {
    const res = await fetch(`${API_BASE}/catalog/products?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`catalog responded ${res.status}`);
    return (await res.json()) as CatalogResponse;
  } catch {
    return { source: 'unavailable', total: 0, limit: 0, offset: 0, items: [] };
  }
}

/**
 * Fetch a single product by id. The catalog has no by-id endpoint yet, so we pull
 * a page and match locally — fine for the MVP catalog size; swap for a dedicated
 * endpoint when the catalog grows.
 */
export async function fetchProduct(id: string): Promise<CatalogProduct | null> {
  const catalog = await fetchCatalog({ limit: 100 });
  return catalog.items.find((p) => p.id === id) ?? null;
}

export interface ProductWithRelated {
  product: CatalogProduct | null;
  related: CatalogProduct[];
}

const PRODUCT_DETAIL_CACHE_MS = 30_000;
const productDetailCache = new Map<string, { expiresAt: number; promise: Promise<ProductWithRelated> }>();

/**
 * Product detail payload for the mobile storefront. Uses one catalog request for
 * MVP scale and derives same-category recommendations locally.
 */
export async function fetchProductWithRelated(id: string, relatedLimit = 6): Promise<ProductWithRelated> {
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
  const catalog = await fetchCatalog({ limit: 100 });
  const product = catalog.items.find((p) => p.id === id) ?? null;
  if (!product) return { product: null, related: [] };

  const related = catalog.items
    .filter((p) => p.id !== product.id && p.category === product.category)
    .sort((a, b) => {
      const stockRank = Number(b.availableUnits > 0) - Number(a.availableUnits > 0);
      if (stockRank !== 0) return stockRank;
      const priceDistance = Math.abs(a.price - product.price) - Math.abs(b.price - product.price);
      if (priceDistance !== 0) return priceDistance;
      return a.name.localeCompare(b.name, 'ru');
    })
    .slice(0, relatedLimit);

  return { product, related };
}
