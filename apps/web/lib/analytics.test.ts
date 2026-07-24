import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from './analytics';

/**
 * The funnel beacon must never leak PII and must stay silent when the visitor
 * opted out (Do-Not-Track / Global Privacy Control). It also must not throw —
 * it is fire-and-forget telemetry. Node env, so window/navigator are stubbed.
 */
function browserEnv(opts: { dnt?: string | null; gpc?: boolean } = {}) {
  const store = new Map<string, string>();
  const fetchSpy = vi.fn(
    async (_url: string, _init: RequestInit) => new Response('{"ok":true}', { status: 201 }),
  );
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
  vi.stubGlobal('navigator', { doNotTrack: opts.dnt ?? null, globalPrivacyControl: opts.gpc });
  vi.stubGlobal('crypto', { randomUUID: () => 'sess-fixed' });
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

afterEach(() => vi.unstubAllGlobals());

describe('analytics.track', () => {
  it('posts an anonymous funnel event when tracking is allowed', () => {
    const fetchSpy = browserEnv();
    track('add_to_cart', { productId: 'p-1' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain('/analytics/events');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ type: 'add_to_cart', productId: 'p-1', sessionId: 'sess-fixed' });
  });

  it('reuses one session id across events', () => {
    const fetchSpy = browserEnv();
    track('product_view', { productId: 'p-1' });
    track('add_to_cart', { productId: 'p-1' });
    const first = JSON.parse((fetchSpy.mock.calls[0])[1].body as string);
    const second = JSON.parse((fetchSpy.mock.calls[1])[1].body as string);
    expect(first.sessionId).toBe(second.sessionId);
  });

  it('emits nothing when Do-Not-Track is set', () => {
    const fetchSpy = browserEnv({ dnt: '1' });
    track('product_view', { productId: 'p-2' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('emits nothing under Global Privacy Control', () => {
    const fetchSpy = browserEnv({ gpc: true });
    track('checkout_started');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
