export type ReviewLoginEnvReader = (name: string) => string | undefined;

export interface ReviewLoginConfig {
  phone: string;
  otp: string;
}

const REVIEW_LOGIN_MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Parse the short-lived App Store review credential once for every consumer.
 *
 * Both the login path and the public auth-capability response must fail closed
 * for exactly the same malformed, expired, or overlong configuration. The OTP
 * is intentionally six decimal digits because the iOS field uses `numberPad`.
 */
export function resolveReviewLoginConfig(
  env: ReviewLoginEnvReader,
  nowMs = Date.now(),
): ReviewLoginConfig | null {
  const configuredPhone = env('AUTH_REVIEW_PHONE')?.trim();
  const otp = env('AUTH_REVIEW_OTP')?.trim();
  const until = env('AUTH_REVIEW_UNTIL')?.trim();
  if (!configuredPhone || !otp || !until || !/^\d{6}$/.test(otp)) return null;

  const phone = normalizeConfiguredPhone(configuredPhone);
  if (!phone) return null;

  const expiryMs = new Date(until).getTime();
  const remainingMs = expiryMs - nowMs;
  if (
    !Number.isFinite(expiryMs)
    || remainingMs <= 0
    || remainingMs > REVIEW_LOGIN_MAX_WINDOW_MS
  ) return null;

  return { phone, otp };
}

function normalizeConfiguredPhone(rawPhone: string): string | null {
  if (!/^\+?[1-9]\d{8,14}$/.test(rawPhone)) return null;
  return rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;
}
