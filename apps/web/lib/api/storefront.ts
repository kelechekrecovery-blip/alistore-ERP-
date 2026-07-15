import { API_BASE, getJson, postAuthJson } from './http';

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
  publishedAt: string | null;
}
export interface StorefrontPoint { id: string; code: string; name: string; address: string; hours: string }
export interface StorefrontPayload { content: StorefrontContent; stores: StorefrontPoint[] }

export async function fetchStorefrontContent(): Promise<StorefrontPayload | null> {
  try {
    const response = await fetch(`${API_BASE}/storefront/content`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`storefront responded ${response.status}`);
    return (await response.json()) as StorefrontPayload;
  } catch {
    return null;
  }
}

export function createStorefrontRevision(input: Omit<StorefrontContent, 'id' | 'version' | 'status' | 'publishedAt'>, accessToken: string) {
  return postAuthJson<StorefrontContent>('/storefront/revisions', input, accessToken);
}

export function fetchStorefrontRevisions(accessToken: string) {
  return getJson<StorefrontContent[]>('/storefront/revisions', accessToken);
}

export function publishStorefrontRevision(id: string, accessToken: string) {
  return postAuthJson<StorefrontContent>(`/storefront/revisions/${encodeURIComponent(id)}/publish`, {}, accessToken);
}
