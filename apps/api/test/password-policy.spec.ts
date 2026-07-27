import { assertStrongPassword } from '../src/staff-auth/password-policy';
import { ValidationError } from '../src/common/errors';

/**
 * F-19 — политика паролей персонала. `@MinLength(8)` пропускал `12345678`.
 * Персонал держит кассу, склад и согласования: пароль обязан пережить подбор.
 */
describe('assertStrongPassword (F-19)', () => {
  const reject = (password: string, reasonPart?: string) => {
    let caught: unknown;
    try {
      assertStrongPassword(password);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).getStatus()).toBe(422);
    expect((caught as ValidationError).code).toBe('password_too_weak');
    if (reasonPart) expect((caught as ValidationError).message).toContain(reasonPart);
  };

  it('отклоняет короче 12 символов', () => {
    reject('Aa1!aa1!', 'символ'); // 8 символов, все классы, но коротко
  });

  it('отклоняет менее 3 классов символов', () => {
    reject('aaaaaaaaaaaa'); // 12, один класс
    reject('aaaaaaaaaa12'); // 12, два класса
  });

  it('отклоняет пароли из deny-list, даже если формально длинные', () => {
    reject('123456789012');
    reject('Password1234'); // содержит password
    reject('Qwerty123456'); // содержит qwerty
  });

  it('пропускает сильный пароль (≥12, ≥3 класса, не из списка)', () => {
    expect(() => assertStrongPassword('AuditPass123!')).not.toThrow();
    expect(() => assertStrongPassword('Kelechek-2026-ok')).not.toThrow();
  });

  it('не режет существующую политику bootstrap — сильный владельческий пароль', () => {
    expect(() => assertStrongPassword('OwnerStrong99$')).not.toThrow();
  });
});
