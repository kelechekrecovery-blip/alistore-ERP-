import {
  clearWebSessionCookies,
  isWebSessionRequest,
  readWebCookie,
  setStaffSessionCookies,
  setWebSessionCookies,
  webAuthResponse,
  WEB_ACCESS_COOKIE,
  WEB_REFRESH_COOKIE,
  WEB_SESSION_HINT_COOKIE,
} from '../src/auth/web-session';

describe('Web cookie session contract', () => {
  const tokens = {
    accessToken: 'access',
    refreshToken: 'refresh',
    tokenType: 'Bearer' as const,
    expiresIn: '15m',
  };

  it('accepts only the explicit Web session marker', () => {
    expect(isWebSessionRequest({ headers: { 'x-alistore-web': '1' } })).toBe(true);
    expect(isWebSessionRequest({ headers: {} })).toBe(false);
    expect(isWebSessionRequest({ headers: { 'x-alistore-web': '0' } })).toBe(false);
  });

  it('reads the selected cookie without confusing similarly named values', () => {
    const request = { headers: { cookie: 'other=value; alistore_refresh=refresh%20value; tail=x' } };
    expect(readWebCookie(request, WEB_REFRESH_COOKIE)).toBe('refresh value');
    expect(readWebCookie(request, WEB_ACCESS_COOKIE)).toBeUndefined();
  });

  it('returns malformed encoded credentials for fail-closed JWT validation', () => {
    const request = { headers: { cookie: 'alistore_access=%' } };
    expect(readWebCookie(request, WEB_ACCESS_COOKIE)).toBe('%');
  });

  it('sets HttpOnly SameSite cookies and hides refresh token from Web JSON', () => {
    const cookies: Array<[string, string, Record<string, unknown>]> = [];
    const response = { cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push([name, value, options]) } as never;
    setWebSessionCookies(response, tokens, true);
    expect(cookies).toHaveLength(3);
    expect(cookies[0][2]).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/api' });
    expect(cookies[2][0]).toBe(WEB_SESSION_HINT_COOKIE);
    expect(cookies[2][2]).toMatchObject({ httpOnly: false, secure: true, sameSite: 'lax', path: '/' });
    expect(webAuthResponse({ headers: { 'x-alistore-web': '1' } }, tokens)).toEqual({
      accessToken: 'access',
      tokenType: 'Bearer',
      expiresIn: '15m',
    });
    expect(webAuthResponse({ headers: {} }, tokens)).toEqual(tokens);
  });

  it('shares the non-secret session hint with storefront subdomains when configured', () => {
    const previous = process.env.AUTH_COOKIE_DOMAIN;
    process.env.AUTH_COOKIE_DOMAIN = '.ali.kg';
    try {
      const cookies: Array<[string, string, Record<string, unknown>]> = [];
      const response = { cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push([name, value, options]) } as never;
      setWebSessionCookies(response, tokens, true);
      expect(cookies[0][2]).not.toHaveProperty('domain');
      expect(cookies[2][2]).toMatchObject({ domain: '.ali.kg', path: '/', httpOnly: false });
    } finally {
      if (previous === undefined) delete process.env.AUTH_COOKIE_DOMAIN;
      else process.env.AUTH_COOKIE_DOMAIN = previous;
    }
  });

  it('shares the staff hint with the admin subdomain when configured', () => {
    const previous = process.env.AUTH_COOKIE_DOMAIN;
    process.env.AUTH_COOKIE_DOMAIN = '.ali.kg';
    try {
      const cookies: Array<[string, string, Record<string, unknown>]> = [];
      const response = { cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push([name, value, options]) } as never;
      setStaffSessionCookies(response, {
        accessToken: 'staff-access',
        refreshToken: 'staff-refresh',
      }, true);
      expect(cookies[2][2]).toMatchObject({ domain: '.ali.kg', path: '/', httpOnly: false });
    } finally {
      if (previous === undefined) delete process.env.AUTH_COOKIE_DOMAIN;
      else process.env.AUTH_COOKIE_DOMAIN = previous;
    }
  });

  it('clears both cookies with the same protected scope', () => {
    const cleared: Array<[string, Record<string, unknown>]> = [];
    const response = { clearCookie: (name: string, options: Record<string, unknown>) => cleared.push([name, options]) } as never;
    clearWebSessionCookies(response, true);
    expect(cleared.map(([name]) => name)).toEqual([WEB_ACCESS_COOKIE, WEB_REFRESH_COOKIE, WEB_SESSION_HINT_COOKIE]);
    expect(cleared[0][1]).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/api', maxAge: 0 });
    expect(cleared[2][1]).toMatchObject({ httpOnly: false, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  });
});
