import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDebt, fetchDebts, isDebtApproval, payDebt } from './debts';

/**
 * UI-DEBTS-GIFT-REFUND. Payload mapping for the staff debt desk: the client must
 * hit the debts endpoints with the exact body/headers the API DTOs expect
 * (CreateDebtDto / DebtPaymentDto), including the idempotency key.
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

describe('createDebt', () => {
  it('POSTs the CreateDebtDto payload with Bearer auth', async () => {
    const calls = stubFetch({ id: 'debt-1' });
    await createDebt({
      orderId: 'order-1',
      principal: 35000,
      installments: 3,
      termDays: 30,
      reason: 'постоянный клиент',
      idempotencyKey: 'debt-order-1',
    }, 'token-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/debts$/);
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      orderId: 'order-1',
      principal: 35000,
      installments: 3,
      termDays: 30,
      reason: 'постоянный клиент',
      idempotencyKey: 'debt-order-1',
    });
  });
});

describe('payDebt', () => {
  it('POSTs the DebtPaymentDto payload to /debts/:id/payments', async () => {
    const calls = stubFetch({ debt: { id: 'debt-1' }, paymentId: 'pay-1', settled: true, idempotent: false });
    await payDebt('debt-1', { amount: 12000, idempotencyKey: 'debt-pay-1' }, 'token-2');
    expect(calls[0].url).toMatch(/\/debts\/debt-1\/payments$/);
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-2');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ amount: 12000, idempotencyKey: 'debt-pay-1' });
  });
});

describe('fetchDebts', () => {
  it('GETs /debts with the customerId/status filters as query params', async () => {
    const calls = stubFetch([]);
    await fetchDebts({ customerId: 'cust-1', status: 'open' }, 'token-3');
    expect(calls[0].url).toMatch(/\/debts\?/);
    expect(calls[0].url).toContain('customerId=cust-1');
    expect(calls[0].url).toContain('status=open');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-3');
  });

  it('omits the query string when no filter is given', async () => {
    const calls = stubFetch([]);
    await fetchDebts({}, 'token-3');
    expect(calls[0].url).toMatch(/\/debts$/);
  });
});

describe('isDebtApproval', () => {
  it('detects the 202 approval parking shape (action=debt)', () => {
    expect(isDebtApproval({ id: 'appr-1', action: 'debt', status: 'requested' })).toBe(true);
  });

  it('treats a booked debt plan as a direct result', () => {
    expect(isDebtApproval({
      id: 'debt-1',
      orderId: 'order-1',
      customerId: 'cust-1',
      principal: 35000,
      balance: 35000,
      installments: 3,
      status: 'open',
      dueDate: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    })).toBe(false);
  });
});
