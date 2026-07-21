import type { Request, Response } from 'express';
import type { AuthTokens } from './auth.service';

export const WEB_SESSION_HEADER = 'x-alistore-web';
export const WEB_ACCESS_COOKIE = 'alistore_access';
export const WEB_REFRESH_COOKIE = 'alistore_refresh';
// Non-secret browser hint used to avoid probing refresh for anonymous pages.
// Access and refresh credentials remain in the HttpOnly cookies above.
export const WEB_SESSION_HINT_COOKIE = 'alistore_session_hint';
export const STAFF_WEB_SESSION_HEADER = 'x-alistore-staff-web';
export const STAFF_ACCESS_COOKIE = 'alistore_staff_access';
export const STAFF_REFRESH_COOKIE = 'alistore_staff_refresh';
export const STAFF_SESSION_HINT_COOKIE = 'alistore_staff_session_hint';

export function isWebSessionRequest(request: Pick<Request, 'headers'>): boolean {
  const value = request.headers[WEB_SESSION_HEADER];
  return value === '1' || value === 'true';
}

export function isStaffWebSessionRequest(request: Pick<Request, 'headers'>): boolean {
  const value = request.headers[STAFF_WEB_SESSION_HEADER];
  return value === '1' || value === 'true';
}

export function readWebCookie(request: Pick<Request, 'headers'>, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

function cookieOptions(production: boolean, maxAge: number) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: 'lax' as const,
    path: '/api',
    maxAge,
  };
}

function sessionHintOptions(production: boolean, maxAge: number) {
  return {
    httpOnly: false,
    secure: production,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

function staffCookieOptions(production: boolean, maxAge: number) {
  return { ...cookieOptions(production, maxAge), path: '/api' };
}

function staffHintOptions(production: boolean, maxAge: number) {
  return { ...sessionHintOptions(production, maxAge), path: '/' };
}

export function setWebSessionCookies(response: Response, tokens: AuthTokens, production: boolean): void {
  response.cookie(WEB_ACCESS_COOKIE, tokens.accessToken, cookieOptions(production, 15 * 60 * 1000));
  response.cookie(WEB_REFRESH_COOKIE, tokens.refreshToken, cookieOptions(production, 30 * 24 * 60 * 60 * 1000));
  response.cookie(WEB_SESSION_HINT_COOKIE, '1', sessionHintOptions(production, 30 * 24 * 60 * 60 * 1000));
}

export function clearWebSessionCookies(response: Response, production: boolean): void {
  const options = cookieOptions(production, 0);
  response.clearCookie(WEB_ACCESS_COOKIE, options);
  response.clearCookie(WEB_REFRESH_COOKIE, options);
  response.clearCookie(WEB_SESSION_HINT_COOKIE, sessionHintOptions(production, 0));
}

export interface WebStaffTokens {
  accessToken: string;
  refreshToken: string;
}

export function setStaffSessionCookies(response: Response, tokens: WebStaffTokens, production: boolean): void {
  response.cookie(STAFF_ACCESS_COOKIE, tokens.accessToken, staffCookieOptions(production, 15 * 60 * 1000));
  response.cookie(STAFF_REFRESH_COOKIE, tokens.refreshToken, staffCookieOptions(production, 30 * 24 * 60 * 60 * 1000));
  response.cookie(STAFF_SESSION_HINT_COOKIE, '1', staffHintOptions(production, 30 * 24 * 60 * 60 * 1000));
}

export function clearStaffSessionCookies(response: Response, production: boolean): void {
  response.clearCookie(STAFF_ACCESS_COOKIE, staffCookieOptions(production, 0));
  response.clearCookie(STAFF_REFRESH_COOKIE, staffCookieOptions(production, 0));
  response.clearCookie(STAFF_SESSION_HINT_COOKIE, staffHintOptions(production, 0));
}

export function webAuthResponse<T extends AuthTokens>(request: Pick<Request, 'headers'>, tokens: T): T | Omit<T, 'refreshToken'> {
  if (!isWebSessionRequest(request)) return tokens;
  const { refreshToken: _refreshToken, ...safe } = tokens;
  return safe;
}
