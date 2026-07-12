import { resolveCorsOptions, resolveHelmetOptions } from '../src/config/runtime-security';

describe('Runtime security configuration', () => {
  const env = (values: Record<string, string>) => (name: string) => values[name];

  it('reflects localhost origins only in non-production development', () => {
    expect(resolveCorsOptions(env({ NODE_ENV: 'development' }))).toEqual({ origin: true });
  });

  it('requires a valid explicit CORS allowlist in production', () => {
    expect(() => resolveCorsOptions(env({ NODE_ENV: 'production' }))).toThrow('CORS_ORIGINS is required');
    expect(() => resolveCorsOptions(env({ NODE_ENV: 'production', CORS_ORIGINS: '*' }))).toThrow('Invalid CORS origin');
    expect(resolveCorsOptions(env({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://alistore.kg,https://admin.alistore.kg',
    }))).toEqual({
      origin: ['https://alistore.kg', 'https://admin.alistore.kg'],
      credentials: true,
    });
  });

  it('enables HSTS and upgrade-insecure-requests only in production', () => {
    expect(resolveHelmetOptions(env({ NODE_ENV: 'development' })).strictTransportSecurity).toBe(false);
    const production = resolveHelmetOptions(env({ NODE_ENV: 'production' }));
    expect(production.strictTransportSecurity).toMatchObject({ maxAge: 31_536_000 });
    expect(production.contentSecurityPolicy).toBeTruthy();
  });
});
