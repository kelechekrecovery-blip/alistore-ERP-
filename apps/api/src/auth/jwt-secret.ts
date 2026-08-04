import { ConfigService } from '@nestjs/config';

const DEV_FALLBACK = 'dev-insecure-change-me';

/**
 * Единственное место, где резолвится секрет подписи.
 *
 * Раньше их было два: этот и собственный `secret()` внутри
 * `guest-capability.ts`, который делал `process.env.JWT_SECRET ?? DEV_FALLBACK`
 * вообще без проверок. Основные токены были защищены, гостевые — нет, хотя с
 * ними идут scope'ы `orders:create`, `payments:intent` и `payments:gift_card`.
 * Два независимых резолвера — это две возможности ошибиться и одна проверка на
 * обе; поэтому проверка теперь одна и общая.
 */
function assertUsable(secret: string | undefined, isProd: boolean): string {
  if (isProd && (!secret || secret === DEV_FALLBACK)) {
    throw new Error(
      'JWT_SECRET must be a strong secret in production (the dev fallback is refused)',
    );
  }
  return secret ?? DEV_FALLBACK;
}

/**
 * Resolve the JWT signing secret. In production a real JWT_SECRET is REQUIRED —
 * refusing to boot with a missing or the known dev value prevents anyone from
 * forging tokens against a predictable key. Dev/tests may use the fallback so
 * they run without extra config.
 */
export function resolveJwtSecret(config: ConfigService): string {
  return assertUsable(
    config.get<string>('JWT_SECRET'),
    config.get<string>('NODE_ENV') === 'production',
  );
}

/**
 * То же самое для кода вне Nest-контекста (гостевые возможности — обычные
 * функции без DI). Читает `process.env` в момент вызова, а не при импорте:
 * секрет может появиться позже старта модуля, а тесты меняют окружение между
 * случаями.
 */
export function resolveJwtSecretFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return assertUsable(env.JWT_SECRET, env.NODE_ENV === 'production');
}
