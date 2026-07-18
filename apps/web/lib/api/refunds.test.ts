import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelRefund, fetchRefund, retryRefund } from './refunds';

/**
 * UI-DEBTS-GIFT-REFUND. Payload mapping for the refunds ops screen: retry posts
 * an empty command body, cancel requires the Idempotency-Key header plus a
 * reason, and the detail read is an authenticated GET.
 */
function stubFetch(responseBody: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }));
  return calls;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchRefund', () => {
  it('GETs /refunds/:id with Bearer auth', async () => {
    const calls = stubFetch({ id: 'refund-1', status: 'failed' });
    const result = await fetchRefund('refund-1', 'token-1');
    expect(calls[0].url).toMatch(/\/refunds\/refund-1$/);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(result).toEqual({ id: 'refund-1', status: 'failed' });
  });
});

describe('retryRefund', () => {
  it('POSTs an empty body to /refunds/:id/retry', async () => {
    const calls = stubFetch({ id: 'refund-1', status: 'processing' });
    await retryRefund('refund-1', 'token-2');
    expect(calls[0].url).toMatch(/\/refunds\/refund-1\/retry$/);
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-2');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({});
  });
});

describe('cancelRefund', () => {
  it('POSTs the reason with a mandatory Idempotency-Key header', async () => {
    const calls = stubFetch({ id: 'refund-1', status: 'rejected' });
    await cancelRefund('refund-1', { reason: 'провайдер не исполнял' }, 'token-3', 'cancel-key-1');
    expect(calls[0].url).toMatch(/\/refunds\/refund-1\/cancel$/);
    expect(calls[0].init.method).toBe('POST');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer token-3');
    expect(headers['idempotency-key']).toBe('cancel-key-1');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ reason: 'провайдер не исполнял' });
  });
});
