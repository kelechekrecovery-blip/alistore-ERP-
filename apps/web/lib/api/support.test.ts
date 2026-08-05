import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSupportTickets, openSupportTicket } from './support';

function stubFetch(responseBody: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
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

describe('openSupportTicket', () => {
  const input = {
    customerId: 'customer-1',
    channel: 'web' as const,
    subject: 'Не пришёл чек',
    body: 'Заказ 4102',
    priority: 'high' as const,
    actor: 'customer_app',
  };

  it('uses the customer-owned idempotent endpoint for authenticated requests', async () => {
    const calls = stubFetch({ id: 'ticket-1' });

    await openSupportTicket(input, {
      accessToken: 'token-1',
      idempotencyKey: 'support-attempt-1',
    });

    expect(calls[0].url).toMatch(/\/support\/tickets\/mine$/);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer token-1');
    expect(headers['idempotency-key']).toBe('support-attempt-1');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      channel: 'web',
      subject: 'Не пришёл чек',
      body: 'Заказ 4102',
      priority: 'high',
    });
  });

  it('keeps the capability-scoped guest endpoint', async () => {
    const calls = stubFetch({ id: 'ticket-2' });

    await openSupportTicket(input, { guestCapability: 'guest-capability-1' });

    expect(calls[0].url).toMatch(/\/support\/tickets$/);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['x-guest-capability']).toBe('guest-capability-1');
    expect(headers.authorization).toBeUndefined();
  });
});

describe('fetchSupportTickets', () => {
  it('uses the customer-owned list endpoint instead of a caller-supplied customer id', async () => {
    const calls = stubFetch([]);

    await fetchSupportTickets('token-2');

    expect(calls[0].url).toMatch(/\/support\/tickets\/mine$/);
    expect(calls[0].url).not.toContain('customerId=');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-2');
  });
});
