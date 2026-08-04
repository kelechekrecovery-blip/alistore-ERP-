import { describe, expect, it } from 'vitest';
import { ApiError } from './api/http';
import { describeAuthError } from './auth-errors';

/**
 * Email login/attach failures must read as plain Russian, not server codes.
 * The server (`apps/api/src/auth/auth.service.ts`) throws ValidationError
 * with a stable `code` — this table is the single place that turns each
 * code into copy a customer can act on.
 */
describe('describeAuthError', () => {
  it('переводит известные коды сервера в понятный текст', () => {
    expect(describeAuthError(new ApiError(422, 'x', 'email_invalid'), 'резерв')).toBe('Введите корректный email.');
    expect(describeAuthError(new ApiError(422, 'x', 'otp_not_found'), 'резерв')).toBe('Код не найден или истёк. Запросите новый.');
    expect(describeAuthError(new ApiError(422, 'x', 'otp_invalid'), 'резерв')).toBe('Неверный код.');
    expect(describeAuthError(new ApiError(422, 'x', 'otp_locked'), 'резерв')).toBe('Слишком много попыток. Запросите новый код.');
    expect(describeAuthError(new ApiError(422, 'x', 'email_taken'), 'резерв')).toBe('Этот адрес уже привязан к другому аккаунту.');
    expect(describeAuthError(new ApiError(422, 'x', 'customer_not_found'), 'резерв')).toBe('Аккаунт с таким email не найден.');
  });

  it('falls back for unknown codes and non-ApiError values', () => {
    expect(describeAuthError(new ApiError(500, 'x', 'unknown_code'), 'резерв')).toBe('резерв');
    expect(describeAuthError(new Error('network down'), 'резерв')).toBe('резерв');
    expect(describeAuthError('boom', 'резерв')).toBe('резерв');
  });
});
