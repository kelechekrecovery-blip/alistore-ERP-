import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMyReturns } from './returns';

function stubFetch(responseBody: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }));
  return calls;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchMyReturns', () => {
  it('GETs the authenticated customer return list', async () => {
    const calls = stubFetch([{ id: 'return-1', status: 'requested' }]);
    const result = await fetchMyReturns('customer-token');

    expect(calls[0].url).toMatch(/\/returns\/mine$/);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer customer-token');
    expect(calls[0].init.cache).toBe('no-store');
    expect(result).toEqual([{ id: 'return-1', status: 'requested' }]);
  });
});
