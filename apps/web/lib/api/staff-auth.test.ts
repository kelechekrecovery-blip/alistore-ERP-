import { beforeEach, describe, expect, it, vi } from 'vitest';
import { staffLogin } from './staff-auth';

function stubLogin() {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      accessToken: 'access',
      staffId: 'staff-1',
      username: 'owner',
      role: 'owner',
      point: 'BISHKEK-1',
      storePoint: { id: 'point-1', code: 'BISHKEK-1', name: 'Bishkek', inventoryLocation: 'BISHKEK-1' },
      totpEnabled: true,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  return calls;
}

beforeEach(() => vi.unstubAllGlobals());

describe('staff login fetcher', () => {
  it('sends the optional TOTP code for MFA-enabled staff accounts', async () => {
    const calls = stubLogin();
    const onAuthenticated = vi.fn();
    await staffLogin('owner', 'password', ' 123456 ', onAuthenticated);

    expect(calls[0].url).toMatch(/\/staff-auth\/login$/u);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      username: 'owner',
      password: 'password',
      totp: '123456',
    });
    expect(calls[0].init.credentials).toBe('include');
    expect(onAuthenticated).toHaveBeenCalledWith(expect.objectContaining({ staffId: 'staff-1' }));
  });

  it('keeps the password-only contract when no TOTP code is supplied', async () => {
    const calls = stubLogin();
    await staffLogin('seller', 'password', '   ', vi.fn());

    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      username: 'seller',
      password: 'password',
    });
  });
});
