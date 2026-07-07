import { ConfigService } from '@nestjs/config';

const DEV_FALLBACK = 'dev-insecure-change-me';

/**
 * Resolve the JWT signing secret. In production a real JWT_SECRET is REQUIRED —
 * refusing to boot with a missing or the known dev value prevents anyone from
 * forging tokens against a predictable key. Dev/tests may use the fallback so
 * they run without extra config.
 */
export function resolveJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  const isProd = config.get<string>('NODE_ENV') === 'production';
  if (isProd && (!secret || secret === DEV_FALLBACK)) {
    throw new Error(
      'JWT_SECRET must be a strong secret in production (the dev fallback is refused)',
    );
  }
  return secret ?? DEV_FALLBACK;
}
