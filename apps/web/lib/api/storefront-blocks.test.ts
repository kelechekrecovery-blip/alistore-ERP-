import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchPublicStorefrontBlocks } from './storefront-blocks';

beforeEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Same rule catalog.ts documents: a caller must be able to tell "no blocks" from
 * "we could not ask". This fetcher returned [] for both, so a storefront whose
 * blocks endpoint was failing looked exactly like one nobody had published to —
 * which is how WEB-E2E-183 presents.
 */
describe('fetchPublicStorefrontBlocks', () => {
  it('returns the blocks when the API answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'b1', title: 'Выбор команды' }],
    }));
    const blocks = await fetchPublicStorefrontBlocks('desktop');
    expect(blocks).toHaveLength(1);
  });

  it('returns an empty array when there is genuinely nothing published', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    expect(await fetchPublicStorefrontBlocks('desktop')).toEqual([]);
  });

  it('returns null — not [] — when the endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    expect(await fetchPublicStorefrontBlocks('desktop')).toBeNull();
  });

  it('returns null when the request cannot be made at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    expect(await fetchPublicStorefrontBlocks('desktop')).toBeNull();
  });
});
