import { API_BASE, getJson, postAuthJson } from './http';
import type { CatalogProduct } from './catalog';

export interface StorefrontBenefit { title: string; body: string }
export interface StorefrontContent {
  id: string;
  version: number;
  status: string;
  heroEyebrow: string;
  heroTitle: string;
  heroBody: string;
  heroCtaLabel: string;
  heroCtaHref: string;
  heroImageUrl: string | null;
  financingText: string | null;
  aboutTitle: string;
  aboutBody: string;
  deliveryTitle: string;
  deliveryBody: string;
  contactPhone: string | null;
  supportHours: string | null;
  benefits: StorefrontBenefit[];
  featuredTitle: string;
  featuredProductIds: string[];
  publishedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
}
export interface StorefrontPoint { id: string; code: string; name: string; address: string; hours: string }
export interface StorefrontPayload { content: StorefrontContent; stores: StorefrontPoint[]; featuredProducts: CatalogProduct[] }

const STOREFRONT_CONTENT_CACHE_MS = 30_000;
let storefrontContentCache: { expiresAt: number; promise: Promise<StorefrontPayload | null> } | null = null;

/**
 * Содержимое витрины: герой, преимущества, магазины, подборка.
 *
 * Ответ разделяется между всеми, кто его просит в пределах окна. На главной это
 * четыре одновременных запроса за одним и тем же: десктопная страница, мобильная
 * (обе смонтированы — вторая лишь скрыта через CSS), плюс шапка и подвал, которые
 * висят на каждой странице. Приём тот же, что у `fetchProductWithRelated`.
 *
 * Кэшируется промис, а не результат: параллельные вызовы схлопываются в один
 * сетевой запрос, а не в четыре подряд.
 *
 * `fresh: true` обязателен для CMS витрины: она перечитывает контент сразу
 * после публикации, и ответ из кэша выглядел бы как «публикация не сработала».
 */
export async function fetchStorefrontContent({ fresh = false }: { fresh?: boolean } = {}): Promise<StorefrontPayload | null> {
  const now = Date.now();
  if (fresh) storefrontContentCache = null;
  if (storefrontContentCache && storefrontContentCache.expiresAt > now) return storefrontContentCache.promise;

  const promise = fetchStorefrontContentUncached();
  storefrontContentCache = { expiresAt: now + STOREFRONT_CONTENT_CACHE_MS, promise };
  // Отказ не залипает в кэше: следующий вызов сходит в сеть заново.
  promise.then((payload) => {
    if (payload === null && storefrontContentCache?.promise === promise) storefrontContentCache = null;
  });
  return promise;
}

async function fetchStorefrontContentUncached(): Promise<StorefrontPayload | null> {
  try {
    const response = await fetch(`${API_BASE}/storefront/content`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`storefront responded ${response.status}`);
    return (await response.json()) as StorefrontPayload;
  } catch {
    return null;
  }
}

export type StorefrontRevisionInput = Omit<StorefrontContent, 'id' | 'version' | 'status' | 'publishedAt' | 'startsAt' | 'endsAt'>;

export function createStorefrontRevision(input: StorefrontRevisionInput, accessToken: string) {
  return postAuthJson<StorefrontContent>('/storefront/revisions', input, accessToken);
}

export function fetchStorefrontRevisions(accessToken: string) {
  return getJson<StorefrontContent[]>('/storefront/revisions', accessToken);
}

export function publishStorefrontRevision(id: string, accessToken: string) {
  return postAuthJson<StorefrontContent>(`/storefront/revisions/${encodeURIComponent(id)}/publish`, {}, accessToken);
}

export function scheduleStorefrontRevision(id: string, input: { startsAt: string; endsAt?: string }, accessToken: string) {
  return postAuthJson<StorefrontContent>(`/storefront/revisions/${encodeURIComponent(id)}/schedule`, input, accessToken);
}

export function cancelStorefrontSchedule(id: string, accessToken: string) {
  return postAuthJson<StorefrontContent>(`/storefront/revisions/${encodeURIComponent(id)}/cancel-schedule`, {}, accessToken);
}
