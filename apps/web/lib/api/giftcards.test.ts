import { beforeEach, describe, expect, it, vi } from 'vitest';
import { issueGiftCard } from './giftcards';

/**
 * UI-DEBTS-GIFT-REFUND. Payload mapping for gift-card issue: the staff form must
 * POST the IssueGiftCardDto shape (amount plus optional note) with Bearer auth.
 */
function stubFetch(responseBody: unknown, status = 201) {
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

describe('issueGiftCard', () => {
  it('POSTs the IssueGiftCardDto payload with Bearer auth and returns the issued card', async () => {
    const issued = {
      id: 'gc-1',
      code: 'GC-ABCDEF123456',
      initialBalance: 5000,
      balance: 5000,
      currency: 'KGS',
      status: 'active',
      customerId: null,
      expiresAt: null,
      redeemable: true,
    };
    const calls = stubFetch(issued);
    const result = await issueGiftCard({ amount: 5000, note: 'Подарочная карта за возврат' }, 'token-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/giftcards$/);
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      amount: 5000,
      note: 'Подарочная карта за возврат',
    });
    expect(result.code).toBe('GC-ABCDEF123456');
    expect(result.balance).toBe(5000);
  });
});
