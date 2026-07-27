import { assertProductionModeForPublicHost, isPublicHostname } from '../src/config/runtime-security';

/**
 * F-02 root cause. Прод отдавал `devCode` в ответе OTP не потому, что код неверен
 * — защёлка в `auth.service.ts` правильная, — а потому что развёрнутый API работал
 * с `NODE_ENV != production`. Одна переменная разом снимала подавление devCode,
 * `Secure` с session-cookie, allowed-hosts middleware, токен на `/api/metrics` и
 * fail-closed на транспорт уведомлений. Сам production-preflight при не-production
 * тоже выходит в начале, поэтому гейт выключался тем же значением, которое должен
 * был ловить.
 *
 * Проверка опирается на фактический `Host` запроса, а не на конфиг: локальный
 * `.env` совершенно законно держит продовые `CORS_ORIGINS`, чтобы отлаживаться
 * против боевой витрины, — по конфигу разработчик неотличим от прода, по хосту
 * отличим всегда.
 */
describe('production mode guard', () => {
  const env = (vars: Record<string, string | undefined>) => (name: string) => vars[name];

  describe('isPublicHostname', () => {
    it('распознаёт публичные хосты', () => {
      expect(isPublicHostname('api.ali.kg')).toBe(true);
      expect(isPublicHostname('ali.kg')).toBe(true);
    });

    it('не считает публичной локальную разработку', () => {
      for (const host of ['localhost', '127.0.0.1', '0.0.0.0', '::1', 'macbook.local', 'app.localhost']) {
        expect(isPublicHostname(host)).toBe(false);
      }
    });

    it('не считает публичными приватные подсети (docker/k8s)', () => {
      for (const host of ['10.0.0.5', '192.168.1.10', '172.16.0.3', '172.31.255.1']) {
        expect(isPublicHostname(host)).toBe(false);
      }
    });

    it('172.32.x — уже не приватный диапазон', () => {
      expect(isPublicHostname('172.32.0.1')).toBe(true);
    });
  });

  it('отказывается обслуживать публичный хост в не-production режиме', () => {
    expect(() => assertProductionModeForPublicHost(env({ NODE_ENV: 'development' }), 'api.ali.kg'))
      .toThrow(/api\.ali\.kg/u);
    expect(() => assertProductionModeForPublicHost(env({}), 'api.ali.kg'))
      .toThrow(/NODE_ENV=<unset>/u);
  });

  it('называет цену вопроса, а не просто «нельзя»', () => {
    expect(() => assertProductionModeForPublicHost(env({ NODE_ENV: 'test' }), 'ali.kg'))
      .toThrow(/OTP codes/u);
  });

  it('не мешает локальной разработке даже с продовыми CORS_ORIGINS в .env', () => {
    const local = env({ NODE_ENV: 'development', CORS_ORIGINS: 'https://ali.kg,https://admin.ali.kg' });
    expect(() => assertProductionModeForPublicHost(local, 'localhost')).not.toThrow();
    expect(() => assertProductionModeForPublicHost(local, '127.0.0.1')).not.toThrow();
  });

  it('пропускает, когда режим действительно production', () => {
    expect(() => assertProductionModeForPublicHost(env({ NODE_ENV: 'production' }), 'api.ali.kg')).not.toThrow();
  });

  it('даёт стенду осознанный выход, закрытый по умолчанию', () => {
    expect(() => assertProductionModeForPublicHost(
      env({ NODE_ENV: 'staging', ALLOW_NON_PRODUCTION_PUBLIC_HOST: 'true' }),
      'staging.ali.kg',
    )).not.toThrow();
  });
});
