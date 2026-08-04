import { ValidationError } from '../common/errors';

const MIN_LENGTH = 12;
const MIN_CLASSES = 3;

/**
 * Подстроки, при наличии которых пароль считается слабым независимо от длины.
 * Не полный словарь — верхушка, которую подбирают первой. Сравнение по нижнему
 * регистру, поэтому `Password1234` и `QWERTY...` тоже отсекаются.
 */
const WEAK_FRAGMENTS = [
  'password', 'parol', 'qwerty', 'qazwsx', 'iloveyou', 'admin', 'welcome',
  'letmein', 'monkey', 'dragon', 'abc123', 'alistore',
];

/** Числовые/клавиатурные последовательности целиком. */
const WEAK_SEQUENCES = ['123456789012', '1234567890', '12345678', '00000000', '11111111'];

function characterClasses(password: string): number {
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(password)) classes += 1;
  return classes;
}

/**
 * Политика паролей персонала (F-19).
 *
 * `@MinLength(8)` в DTO пропускал `12345678`. Учётка сотрудника открывает кассу,
 * склад и согласования — пароль обязан пережить подбор. Проверка на сервисе, а
 * не в DTO: нужен коде́рованный 422 `password_too_weak` с причиной, а не
 * безликий 400 от class-validator, и одна точка правды для create/bootstrap/reset.
 *
 * Существующие учётки не затрагиваются — хэши не перевыпускаются; политика
 * применяется только при установке нового пароля.
 */
export function assertStrongPassword(password: string): void {
  if (password.length < MIN_LENGTH) {
    throw new ValidationError('password_too_weak', `Пароль короче ${MIN_LENGTH} символов`);
  }
  if (characterClasses(password) < MIN_CLASSES) {
    throw new ValidationError(
      'password_too_weak',
      `Нужно минимум ${MIN_CLASSES} класса символов из четырёх: строчные, прописные, цифры, спецсимволы`,
    );
  }
  const lower = password.toLowerCase();
  if (WEAK_SEQUENCES.includes(password) || WEAK_FRAGMENTS.some((fragment) => lower.includes(fragment))) {
    throw new ValidationError('password_too_weak', 'Пароль содержит распространённую последовательность — выберите другой');
  }
}
