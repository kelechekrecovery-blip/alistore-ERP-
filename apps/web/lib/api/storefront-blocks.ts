import type { CatalogProduct } from './catalog';
import { API_BASE, getJson, postAuthJson } from './http';

export type StorefrontBlockType = 'hero' | 'promo' | 'info' | 'collection';
export type StorefrontBlockStatus = 'draft' | 'published' | 'scheduled' | 'archived';
export type StorefrontBlockDevice = 'all' | 'desktop' | 'mobile';

export interface StorefrontBlock {
  id: string;
  type: StorefrontBlockType;
  status: StorefrontBlockStatus;
  device: StorefrontBlockDevice;
  position: number;
  title: string;
  eyebrow: string | null;
  body: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  imageUrl: string | null;
  tone: 'dark' | 'coral' | 'light' | 'lime';
  productIds: string[];
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  products?: CatalogProduct[];
}

export type StorefrontBlockInput = Pick<StorefrontBlock, 'type' | 'device' | 'title' | 'tone' | 'productIds'> &
  Partial<Pick<StorefrontBlock, 'eyebrow' | 'body' | 'ctaLabel' | 'ctaHref' | 'imageUrl'>>;

export async function fetchPublicStorefrontBlocks(device: 'desktop' | 'mobile') {
  try {
    const response = await fetch(`${API_BASE}/storefront-blocks/public?device=${device}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`storefront blocks responded ${response.status}`);
    return (await response.json()) as StorefrontBlock[];
  } catch {
    return [];
  }
}

export function fetchStorefrontBlocks(accessToken: string) {
  return getJson<StorefrontBlock[]>('/storefront-blocks', accessToken);
}

export function createStorefrontBlock(input: StorefrontBlockInput, accessToken: string) {
  return postAuthJson<StorefrontBlock>('/storefront-blocks', input, accessToken);
}

export function publishStorefrontBlock(id: string, accessToken: string) {
  return postAuthJson<StorefrontBlock>(`/storefront-blocks/${encodeURIComponent(id)}/publish`, {}, accessToken);
}

export function scheduleStorefrontBlock(id: string, input: { startsAt: string; endsAt?: string }, accessToken: string) {
  return postAuthJson<StorefrontBlock>(`/storefront-blocks/${encodeURIComponent(id)}/schedule`, input, accessToken);
}

export function cancelStorefrontBlockSchedule(id: string, accessToken: string) {
  return postAuthJson<StorefrontBlock>(`/storefront-blocks/${encodeURIComponent(id)}/cancel-schedule`, {}, accessToken);
}

export function archiveStorefrontBlock(id: string, accessToken: string) {
  return postAuthJson<StorefrontBlock>(`/storefront-blocks/${encodeURIComponent(id)}/archive`, {}, accessToken);
}

export function reorderStorefrontBlocks(ids: string[], accessToken: string) {
  return postAuthJson<StorefrontBlock[]>('/storefront-blocks/reorder', { ids }, accessToken);
}
