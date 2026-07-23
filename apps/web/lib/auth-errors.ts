import { ApiError } from './api/http';

/**
 * Maps the machine-readable `code` on domain errors thrown by the email OTP
 * flows (`/auth/email/*`, `apps/api/src/auth/auth.service.ts`) to Russian
 * copy a customer can act on. Keyed by `code`, not by server `message`,
 * because the message text is free to change without breaking the UI.
 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  email_invalid: 'Введите корректный email.',
  otp_not_found: 'Код не найден или истёк. Запросите новый.',
  otp_invalid: 'Неверный код.',
  otp_locked: 'Слишком много попыток. Запросите новый код.',
  email_taken: 'Этот адрес уже привязан к другому аккаунту.',
  customer_not_found: 'Аккаунт с таким email не найден.',
  email_transport_unavailable: 'Отправка писем временно недоступна, попробуйте позже.',
};

/** Human Russian copy for an auth error; `fallback` covers unknown codes and non-API failures. */
export function describeAuthError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.code) {
    return AUTH_ERROR_MESSAGES[error.code] ?? fallback;
  }
  return fallback;
}
