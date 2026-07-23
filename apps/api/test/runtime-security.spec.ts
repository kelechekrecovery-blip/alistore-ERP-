import {
  allowedHostsMiddleware,
  resolveAllowedHosts,
  resolveCorsOptions,
  resolveHelmetOptions,
  resolveTrustProxy,
} from '../src/config/runtime-security';

describe('Runtime security configuration', () => {
  const env = (values: Record<string, string>) => (name: string) => values[name];

  it('reflects localhost origins only in non-production development', () => {
    // credentials must be on here too: staff/customer web auth is cookie-based
    // (`credentials: 'include'`), and without Access-Control-Allow-Credentials the
    // browser blocks every login with a bare "Failed to fetch" in local dev.
    expect(resolveCorsOptions(env({ NODE_ENV: 'development' }))).toEqual({ origin: true, credentials: true });
  });

  it('requires a valid explicit CORS allowlist in production', () => {
    expect(() => resolveCorsOptions(env({ NODE_ENV: 'production' }))).toThrow('CORS_ORIGINS is required');
    expect(() => resolveCorsOptions(env({ NODE_ENV: 'production', CORS_ORIGINS: '*' }))).toThrow('Invalid CORS origin');
    expect(resolveCorsOptions(env({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://ali.kg,https://admin.ali.kg',
    }))).toEqual({
      origin: ['https://ali.kg', 'https://admin.ali.kg'],
      credentials: true,
    });
  });

  it('enables HSTS and upgrade-insecure-requests only in production', () => {
    expect(resolveHelmetOptions(env({ NODE_ENV: 'development' })).strictTransportSecurity).toBe(false);
    const production = resolveHelmetOptions(env({ NODE_ENV: 'production' }));
    expect(production.strictTransportSecurity).toMatchObject({ maxAge: 31_536_000 });
    expect(production.contentSecurityPolicy).toBeTruthy();
  });

  it('requires exact hostnames and rejects unsafe production values', () => {
    expect(() => resolveAllowedHosts(env({ NODE_ENV: 'production' }))).toThrow('ALLOWED_HOSTS is required');
    expect(() => resolveAllowedHosts(env({ NODE_ENV: 'production', ALLOWED_HOSTS: 'https://api.ali.kg' }))).toThrow('Invalid allowed host');
    expect(resolveAllowedHosts(env({ NODE_ENV: 'production', ALLOWED_HOSTS: 'api.ali.kg,API.ALI.KG' }))).toEqual(['api.ali.kg']);
  });

  it('allows health probes but rejects unknown production hosts', () => {
    const middleware = allowedHostsMiddleware(env({ NODE_ENV: 'production', ALLOWED_HOSTS: 'api.ali.kg' }));
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware({ path: '/api/orders', headers: { host: 'service.onrender.com' } } as never, response as never, next);
    expect(response.status).toHaveBeenCalledWith(421);
    expect(next).not.toHaveBeenCalled();

    middleware({ path: '/api/health/live', headers: { host: 'service.onrender.com' } } as never, response as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  /**
   * Прод стоит за одним обратным прокси. Без доверия к нему `req.ip` — это адрес
   * прокси, и весь rate-limit схлопывается в один бакет на всех клиентов сразу.
   * Вне прода доверие обязано быть выключено: там ходят напрямую, и любой клиент
   * подделал бы себе свежий бакет заголовком `X-Forwarded-For`.
   */
  it('trusts exactly one proxy in production and none outside it', () => {
    expect(resolveTrustProxy(env({ NODE_ENV: 'production' }))).toBe(1);
    expect(resolveTrustProxy(env({ NODE_ENV: 'development' }))).toBe(false);
    expect(resolveTrustProxy(env({}))).toBe(false);

    // Явная настройка перекрывает дефолт — на случай второго прокси перед Render.
    expect(resolveTrustProxy(env({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '2' }))).toBe(2);
    // Ноль читается как «прокси нет», а не как «доверять всем».
    expect(resolveTrustProxy(env({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '0' }))).toBe(false);

    // Мусор обязан падать на старте, а не тихо превращаться в доверие ко всем.
    expect(() => resolveTrustProxy(env({ TRUST_PROXY_HOPS: 'true' }))).toThrow('Invalid TRUST_PROXY_HOPS');
    expect(() => resolveTrustProxy(env({ TRUST_PROXY_HOPS: '-1' }))).toThrow('Invalid TRUST_PROXY_HOPS');
  });
});
