import { API_BASE, getJson, postAuthJson, postAuthVoid, postJson } from './http';

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn: string;
}

export interface AuthUser {
  customerId: string;
  phone: string;
  typ: string;
}

export function authRequestOtp(phone: string): Promise<{ challengeId: string; devCode?: string }> {
  return postJson('/auth/otp/request', { phone });
}

export function authVerifyOtp(phone: string, code: string): Promise<AuthTokens> {
  return postJson('/auth/otp/verify', { phone, code }, { 'x-alistore-web': '1' }, true);
}

export function authRequestRecoveryOtp(phone: string): Promise<{ challengeId: string; devCode?: string }> {
  return postJson('/auth/recovery/request', { phone });
}

export function authVerifyRecoveryOtp(phone: string, code: string): Promise<AuthTokens> {
  return postJson('/auth/recovery/verify', { phone, code }, { 'x-alistore-web': '1' }, true);
}

/**
 * Email is a second login channel into the same account — Customer.phone
 * stays the unique key. A code is only ever delivered to an address already
 * attached to a customer (`apps/api/src/auth/auth.service.ts`).
 */
export function authRequestEmailOtp(email: string): Promise<{ challengeId: string; devCode?: string }> {
  return postJson('/auth/email/request', { email });
}

export function authVerifyEmailOtp(email: string, code: string): Promise<AuthTokens> {
  return postJson('/auth/email/verify', { email, code }, { 'x-alistore-web': '1' }, true);
}

/** Send a confirmation code to an address the signed-in customer wants to attach. */
export function authRequestEmailAttach(email: string, accessToken: string): Promise<{ challengeId: string; devCode?: string }> {
  return postAuthJson('/auth/email/attach/request', { email }, accessToken);
}

/** Confirm the attach code; binds the address to the signed-in account. No response body. */
export function authConfirmEmailAttach(email: string, code: string, accessToken: string): Promise<void> {
  return postAuthVoid('/auth/email/attach/confirm', { email, code }, accessToken);
}

export function authTelegramLogin(
  initData: string,
  source: 'mini_app' | 'login_widget' = 'mini_app',
): Promise<AuthTokens> {
  return postJson('/auth/social/telegram', { initData, source }, { 'x-alistore-web': '1' }, true);
}

export function authAppleLogin(
  identityToken: string,
  options: { nonce?: string; name?: string } = {},
): Promise<AuthTokens> {
  return postJson('/auth/social/apple', { identityToken, ...options }, { 'x-alistore-web': '1' }, true);
}

export function authRefresh(refreshToken?: string): Promise<AuthTokens> {
  return postJson('/auth/refresh', refreshToken ? { refreshToken } : {}, { 'x-alistore-web': '1' }, true);
}

export async function authLogout(refreshToken?: string): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-alistore-web': '1' },
    credentials: 'include',
    body: JSON.stringify(refreshToken ? { refreshToken } : {}),
  }).catch(() => undefined);
}

export function authMe(accessToken: string): Promise<AuthUser> {
  return getJson('/auth/me', accessToken);
}

export interface MyDevice {
  imei: string;
  product: string;
  status: string;
  warrantyUntil: string | null;
  daysLeft: number | null;
  warranty: { id: string; status: string; sla: string } | null;
}

export function fetchMyDevices(accessToken: string): Promise<MyDevice[]> {
  return getJson('/customers/me/devices', accessToken);
}
