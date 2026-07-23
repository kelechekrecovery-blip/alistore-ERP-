import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authConfirmEmailAttach,
  authRequestEmailAttach,
  authRequestEmailOtp,
  authVerifyEmailOtp,
} from './auth';

/**
 * Email is a second login channel into the same account (Customer.phone stays
 * the unique key) — see apps/api/src/auth/auth.controller.ts. These fetchers
 * must hit the exact four endpoints with the exact payload/header shape the
 * server expects.
 */
function stubFetch(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }));
  return calls;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('email login/attach fetchers', () => {
  it('requests a login code for the given email', async () => {
    const calls = stubFetch({ challengeId: 'c1', devCode: '123456' });
    const result = await authRequestEmailOtp('user@example.com');
    expect(calls[0].url).toMatch(/\/auth\/email\/request$/);
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ email: 'user@example.com' });
    expect(result.devCode).toBe('123456');
  });

  it('verifies a login code and marks the request as a web session', async () => {
    const calls = stubFetch({ accessToken: 'a', tokenType: 'Bearer', expiresIn: '15m' });
    await authVerifyEmailOtp('user@example.com', '123456');
    expect(calls[0].url).toMatch(/\/auth\/email\/verify$/);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ email: 'user@example.com', code: '123456' });
    expect((calls[0].init.headers as Record<string, string>)['x-alistore-web']).toBe('1');
    expect(calls[0].init.credentials).toBe('include');
  });

  it('requests an attach code with the caller Bearer token', async () => {
    const calls = stubFetch({ challengeId: 'c2', devCode: '654321' });
    const result = await authRequestEmailAttach('user@example.com', 'token-1');
    expect(calls[0].url).toMatch(/\/auth\/email\/attach\/request$/);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ email: 'user@example.com' });
    expect(result.devCode).toBe('654321');
  });

  it('confirms an attach code without requiring a JSON response body', async () => {
    const calls = stubFetch(null, 200);
    await expect(authConfirmEmailAttach('user@example.com', '654321', 'token-1')).resolves.toBeUndefined();
    expect(calls[0].url).toMatch(/\/auth\/email\/attach\/confirm$/);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ email: 'user@example.com', code: '654321' });
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
  });
});
