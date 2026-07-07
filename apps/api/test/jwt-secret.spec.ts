import { ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from '../src/auth/jwt-secret';

const cfg = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('resolveJwtSecret', () => {
  it('returns the configured secret', () => {
    expect(resolveJwtSecret(cfg({ JWT_SECRET: 'a-strong-secret' }))).toBe(
      'a-strong-secret',
    );
  });

  it('allows the dev fallback outside production', () => {
    expect(resolveJwtSecret(cfg({}))).toBe('dev-insecure-change-me');
  });

  it('refuses to boot in production without a real secret', () => {
    expect(() => resolveJwtSecret(cfg({ NODE_ENV: 'production' }))).toThrow(
      /JWT_SECRET/,
    );
    expect(() =>
      resolveJwtSecret(
        cfg({ NODE_ENV: 'production', JWT_SECRET: 'dev-insecure-change-me' }),
      ),
    ).toThrow(/JWT_SECRET/);
  });

  it('accepts a strong secret in production', () => {
    expect(
      resolveJwtSecret(cfg({ NODE_ENV: 'production', JWT_SECRET: 'real-secret' })),
    ).toBe('real-secret');
  });
});
