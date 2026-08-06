import { ApiError } from './api/http';

/**
 * Maps the machine-readable `code` on domain errors thrown by the email OTP
 * flows (`/auth/email/*`, `apps/api/src/auth/auth.service.ts`) to Russian
 * copy a customer can act on. Keyed by `code`, not by server `message`,
 * because the message text is free to change without breaking the UI.
 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  email_invalid: 'Введите корректный email.',
  phone_invalid: 'Введите корректный номер телефона.',
  otp_not_found: 'Код не найден или истёк. Запросите новый.',
  otp_invalid: 'Неверный код.',
  otp_locked: 'Слишком много попыток. Запросите новый код.',
  email_taken: 'Этот адрес уже привязан к другому аккаунту.',
  customer_not_found: 'Аккаунт с таким email не найден.',
  email_transport_unavailable: 'Отправка писем временно недоступна, попробуйте позже.',
  sms_gateway_unreachable: 'SMS-шлюз недоступен. Проверьте связь и попробуйте ещё раз.',
  sms_gateway_rejected: 'SMS-шлюз не принял отправку. Попробуйте позже или войдите другим способом.',
  production_sms_provider_not_activated: 'SMS-вход временно недоступен. Войдите другим способом или оформите заказ как гость.',
  review_login_locked: 'Слишком много попыток. Запросите новый код.',
  social_enrollment_invalid: 'Подтверждение входа истекло. Начните вход через провайдера заново.',
  social_identity_already_linked: 'Этот аккаунт провайдера уже привязан к другому профилю.',
  social_auth_replayed: 'Ссылка входа уже использована. Начните вход заново.',
  social_provider_not_configured: 'Этот способ входа временно недоступен.',
  apple_nonce_required: 'Не удалось подтвердить вход Apple. Попробуйте ещё раз.',
  google_nonce_required: 'Не удалось подтвердить вход Google. Попробуйте ещё раз.',
};

/** Human Russian copy for an auth error; `fallback` covers unknown codes and non-API failures. */
export function describeAuthError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.code) {
    return AUTH_ERROR_MESSAGES[error.code] ?? fallback;
  }
  return fallback;
}
