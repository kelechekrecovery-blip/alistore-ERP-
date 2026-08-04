import { API_BASE, ApiError, getJson, getPublicJson, postAuthJson, postAuthVoid, postJson } from './http';

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn: string;
}

export type SocialAuthResult =
  | ({ status: 'authenticated' } & AuthTokens)
  | {
      status: 'enrollment_required';
      enrollmentToken: string;
      expiresIn: number;
    };

/** Историческое имя того же результата — Telegram был первым социальным входом. */
export type TelegramAuthResult = SocialAuthResult;

export interface AuthMethodState {
  enabled: boolean;
  registers: boolean;
}

export interface AuthMethodsView {
  phone: AuthMethodState;
  email: AuthMethodState;
  telegram: AuthMethodState & { botUsername: string | null };
  apple: AuthMethodState & { clientId: string | null };
  recovery: { enabled: boolean };
  anyLoginAvailable: boolean;
  registrationAvailable: boolean;
}

/**
 * Какие входы живы — спрашиваем сервер, а не собственный бандл.
 *
 * `NEXT_PUBLIC_*` вшиваются в сборку Next: канал, включённый владельцем в
 * дашборде хостинга уже после сборки образа, для витрины не существовал бы до
 * следующего деплоя. Здесь ответ даёт тот же процесс, который будет обслуживать
 * вход.
 */
export function authMethods(): Promise<AuthMethodsView> {
  return getPublicJson('/auth/methods');
}

export interface AuthUser {
  customerId: string;
  phone: string;
  typ: string;
}

export function authRequestOtp(phone: string): Promise<{ challengeId: string; devCode?: string }> {
  return postJson('/auth/otp/request', { phone });
}

export function authVerifyOtp(phone: string, code: string, challengeId?: string): Promise<AuthTokens> {
  return postJson(
    '/auth/otp/verify',
    { phone, code, ...(challengeId ? { challengeId } : {}) },
    { 'x-alistore-web': '1' },
    true,
  );
}

export function authRequestRecoveryOtp(phone: string): Promise<{ challengeId: string; devCode?: string }> {
  return postJson('/auth/recovery/request', { phone });
}

export function authVerifyRecoveryOtp(phone: string, code: string, challengeId?: string): Promise<AuthTokens> {
  return postJson(
    '/auth/recovery/verify',
    { phone, code, ...(challengeId ? { challengeId } : {}) },
    { 'x-alistore-web': '1' },
    true,
  );
}

/**
 * Email is a second login channel into the same account — Customer.phone
 * stays the unique key. A code is only ever delivered to an address already
 * attached to a customer (`apps/api/src/auth/auth.service.ts`).
 */
export function authRequestEmailOtp(email: string): Promise<{ challengeId: string; devCode?: string }> {
  return postJson('/auth/email/request', { email });
}

export function authVerifyEmailOtp(email: string, code: string, challengeId?: string): Promise<AuthTokens> {
  return postJson(
    '/auth/email/verify',
    { email, code, ...(challengeId ? { challengeId } : {}) },
    { 'x-alistore-web': '1' },
    true,
  );
}

/** Send a confirmation code to an address the signed-in customer wants to attach. */
export function authRequestEmailAttach(email: string, accessToken: string): Promise<{ challengeId: string; devCode?: string }> {
  return postAuthJson('/auth/email/attach/request', { email }, accessToken);
}

/** Confirm the attach code; binds the address to the signed-in account. No response body. */
export function authConfirmEmailAttach(
  email: string,
  code: string,
  accessToken: string,
  challengeId?: string,
): Promise<void> {
  return postAuthVoid(
    '/auth/email/attach/confirm',
    { email, code, ...(challengeId ? { challengeId } : {}) },
    accessToken,
  );
}

export function authTelegramLogin(
  initData: string,
  source: 'mini_app' | 'login_widget' = 'mini_app',
): Promise<TelegramAuthResult> {
  return postJson('/auth/v2/social/telegram', { initData, source }, { 'x-alistore-web': '1' }, true);
}

export function authCompleteSocialEnrollment(
  enrollmentToken: string,
  phone: string,
  code: string,
  challengeId?: string,
): Promise<{ status: 'authenticated' } & AuthTokens> {
  return postJson(
    '/auth/v2/social/enrollment/complete',
    { enrollmentToken, phone, code, ...(challengeId ? { challengeId } : {}) },
    { 'x-alistore-web': '1' },
    true,
  );
}

/**
 * Sign in with Apple → v2, а не legacy `/auth/social/apple`.
 *
 * Legacy-маршрут умеет опознать только того, у кого CustomerIdentity уже есть в
 * базе, и любому новому человеку отвечает `social_enrollment_required` без пути
 * дальше. Именно по этой причине ревьюер App Store не смог войти. v2 в том же
 * случае возвращает `enrollment_required` с токеном, которым привязывается
 * телефон, — то есть даёт регистрацию, а не тупик.
 *
 * `nonce` обязателен: сервер отклоняет запрос без него (`apple_nonce_required`).
 * В вебе Apple кладёт в claim `nonce` ту же строку, что передана в
 * `AppleID.auth.init` — поэтому сюда идёт она же, без хэширования (в отличие от
 * нативного iOS, где в токен попадает SHA-256).
 */
export function authAppleLogin(
  identityToken: string,
  options: { nonce: string; name?: string },
): Promise<SocialAuthResult> {
  return postJson('/auth/v2/social/apple', { identityToken, ...options }, { 'x-alistore-web': '1' }, true);
}

export function authRefresh(refreshToken?: string): Promise<AuthTokens> {
  return postJson('/auth/refresh', refreshToken ? { refreshToken } : {}, { 'x-alistore-web': '1' }, true);
}

export async function authLogout(refreshToken?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-alistore-web': '1' },
    credentials: 'include',
    body: JSON.stringify(refreshToken ? { refreshToken } : {}),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { code?: string; message?: string };
    throw new ApiError(
      response.status,
      detail.message ?? `request failed ${response.status}`,
      detail.code,
    );
  }
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
