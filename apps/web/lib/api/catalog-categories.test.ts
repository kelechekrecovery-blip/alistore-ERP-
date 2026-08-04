import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalogCategories } from './catalog';

beforeEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The rule this file already documents for products: a caller must be able to
 * tell "nothing here" from "we could not ask". Categories broke it — the fetcher
 * swallowed to [] and the catalog page added a second .catch(() => []) on top,
 * two lines under a comment saying a catalog failure is never substituted with
 * emptiness. A shopper got a catalog with no filters and no sign anything failed.
 */
describe('fetchCatalogCategories', () => {
  it('returns the categories when the API answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ category: 'Смартфоны', count: 3 }],
    }));
    expect(await fetchCatalogCategories()).toHaveLength(1);
  });

  it('returns an empty array when there genuinely are no categories', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    expect(await fetchCatalogCategories()).toEqual([]);
  });

  it('returns null — not [] — when the endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    expect(await fetchCatalogCategories()).toBeNull();
  });

  it('returns null when the request cannot be made at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    expect(await fetchCatalogCategories()).toBeNull();
  });
});
