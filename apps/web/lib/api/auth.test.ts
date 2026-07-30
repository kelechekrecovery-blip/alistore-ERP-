import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authConfirmEmailAttach,
  authCompleteSocialEnrollment,
  authLogout,
  authRequestEmailAttach,
  authRequestEmailOtp,
  authRequestOtp,
  authTelegramLogin,
  authVerifyEmailOtp,
  authVerifyOtp,
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
    await authVerifyEmailOtp('user@example.com', '123456', 'email-challenge');
    expect(calls[0].url).toMatch(/\/auth\/email\/verify$/);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      email: 'user@example.com',
      code: '123456',
      challengeId: 'email-challenge',
    });
    expect((calls[0].init.headers as Record<string, string>)['x-alistore-web']).toBe('1');
    expect(calls[0].init.credentials).toBe('include');
  });

  it('keeps the legacy email verify payload when no challenge id is available', async () => {
    const calls = stubFetch({ accessToken: 'a', tokenType: 'Bearer', expiresIn: '15m' });
    await authVerifyEmailOtp('user@example.com', '123456');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      email: 'user@example.com',
      code: '123456',
    });
  });

  it('requests an attach code with the caller Bearer token', async () => {
    const calls = stubFetch({ challengeId: 'c2', devCode: '654321' });
    const result = await authRequestEmailAttach('user@example.com', 'token-1');
    expect(calls[0].url).toMatch(/\/auth\/email\/attach\/request$/);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ email: 'user@example.com' });
    expect(result.devCode).toBe('654321');
  });

  it('confirms an attach code with its request challenge id without requiring a JSON response body', async () => {
    const calls = stubFetch(null, 200);
    await expect(authConfirmEmailAttach('user@example.com', '654321', 'token-1', 'attach-challenge')).resolves.toBeUndefined();
    expect(calls[0].url).toMatch(/\/auth\/email\/attach\/confirm$/);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      email: 'user@example.com',
      code: '654321',
      challengeId: 'attach-challenge',
    });
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
  });

  it('keeps the legacy attach-confirm payload when no challenge id is available', async () => {
    const calls = stubFetch(null, 200);
    await authConfirmEmailAttach('user@example.com', '654321', 'token-1');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      email: 'user@example.com',
      code: '654321',
    });
  });
});

describe('phone OTP fetchers', () => {
  it('returns the challenge id from an OTP request', async () => {
    const calls = stubFetch({ challengeId: 'phone-challenge', devCode: '123456' });
    await expect(authRequestOtp('+996700000000')).resolves.toEqual({
      challengeId: 'phone-challenge',
      devCode: '123456',
    });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ phone: '+996700000000' });
  });

  it('propagates the request challenge id into verification', async () => {
    const calls = stubFetch({ accessToken: 'a', tokenType: 'Bearer', expiresIn: '15m' });
    await authVerifyOtp('+996700000000', '123456', 'phone-challenge');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      phone: '+996700000000',
      code: '123456',
      challengeId: 'phone-challenge',
    });
    expect(calls[0].init.credentials).toBe('include');
  });

  it('keeps the legacy phone verify payload when no challenge id is available', async () => {
    const calls = stubFetch({ accessToken: 'a', tokenType: 'Bearer', expiresIn: '15m' });
    await authVerifyOtp('+996700000000', '123456');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      phone: '+996700000000',
      code: '123456',
    });
  });
});

describe('Telegram social enrollment v2 fetchers', () => {
  it('uses the v2 Telegram endpoint and returns the enrollment result without persisting it', async () => {
    const calls = stubFetch({
      status: 'enrollment_required',
      enrollmentToken: 'opaque-enrollment-token',
      expiresIn: 600,
    });

    await expect(authTelegramLogin('signed-init-data', 'mini_app')).resolves.toEqual({
      status: 'enrollment_required',
      enrollmentToken: 'opaque-enrollment-token',
      expiresIn: 600,
    });
    expect(calls[0].url).toMatch(/\/auth\/v2\/social\/telegram$/);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      initData: 'signed-init-data',
      source: 'mini_app',
    });
    expect(calls[0].init.credentials).toBe('include');
  });

  it('completes enrollment with the phone challenge and marks it as a web session', async () => {
    const calls = stubFetch({
      status: 'authenticated',
      accessToken: 'access',
      tokenType: 'Bearer',
      expiresIn: '15m',
    });

    await authCompleteSocialEnrollment(
      'opaque-enrollment-token',
      '+996700000000',
      '123456',
      'phone-challenge',
    );
    expect(calls[0].url).toMatch(/\/auth\/v2\/social\/enrollment\/complete$/);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      enrollmentToken: 'opaque-enrollment-token',
      phone: '+996700000000',
      code: '123456',
      challengeId: 'phone-challenge',
    });
    expect(calls[0].init.credentials).toBe('include');
  });
});

describe('web logout fetcher', () => {
  it('surfaces a network failure instead of reporting logout success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(authLogout()).rejects.toThrow('network down');
  });

  it('surfaces a non-success server response', async () => {
    stubFetch({ code: 'logout_failed', message: 'logout unavailable' }, 503);
    await expect(authLogout()).rejects.toMatchObject({
      status: 503,
      code: 'logout_failed',
      message: 'logout unavailable',
    });
  });
});
