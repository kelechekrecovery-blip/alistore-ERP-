import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordCampaignSpend } from './campaigns';

/**
 * Recording ad spend reconciles money against a campaign, so the client must hit
 * the exact endpoint with the whole payload and the bearer token — a dropped
 * field or a wrong path would silently under- or over-count campaign ROI.
 */
afterEach(() => vi.unstubAllGlobals());

describe('recordCampaignSpend', () => {
  it('posts the full spend payload to the campaign spend endpoint', async () => {
    const fetchSpy = vi.fn(
      async (_url: string, _init: RequestInit) => new Response('{"campaign":{}}', { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await recordCampaignSpend(
      'camp-1',
      { idempotencyKey: 'key-1', provider: 'meta_ads', externalRef: 'inv-9', amount: 2500, occurredAt: '2026-07-15T08:00:00.000Z' },
      'tok-abc',
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain('/campaigns/camp-1/spend');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-abc');
    expect(JSON.parse(init.body as string)).toEqual({
      idempotencyKey: 'key-1',
      provider: 'meta_ads',
      externalRef: 'inv-9',
      amount: 2500,
      occurredAt: '2026-07-15T08:00:00.000Z',
    });
  });
});
