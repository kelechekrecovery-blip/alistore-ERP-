import { API_BASE, getJson, postJson } from './http';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
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
  return postJson('/auth/otp/verify', { phone, code });
}

export function authRequestRecoveryOtp(phone: string): Promise<{ challengeId: string; devCode?: string }> {
  return postJson('/auth/recovery/request', { phone });
}

export function authVerifyRecoveryOtp(phone: string, code: string): Promise<AuthTokens> {
  return postJson('/auth/recovery/verify', { phone, code });
}

export function authRefresh(refreshToken: string): Promise<AuthTokens> {
  return postJson('/auth/refresh', { refreshToken });
}

export async function authLogout(refreshToken: string): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
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
