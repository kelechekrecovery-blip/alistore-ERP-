import { assertProductionRuntimeReady, buildProductionPreflightReport } from '../src/health/production-preflight';

describe('Production preflight report', () => {
  it('blocks the production example until real core settings are filled', () => {
    const report = buildProductionPreflightReport(
      (name) =>
        ({
          NODE_ENV: 'production',
          DATABASE_URL: '',
          JWT_SECRET: '',
          AUTH_OTP_DEV_ECHO: 'false',
          RESERVATION_SWEEP_ENABLED: 'true',
          OUTBOX_RELAY_ENABLED: 'true',
          REFUND_RELAY_ENABLED: '',
          PROCESS_ROLE: '',
        })[name],
      new Date('2026-07-08T00:00:00.000Z'),
    );

    expect(report.status).toBe('blocked');
    expect(report.generatedAt).toBe('2026-07-08T00:00:00.000Z');
    // 7, а не 6: добавлена проверка sms_provider_value. Конфигурация без
    // SMS_PROVIDER в production неполна — именно её отсутствие роняло контейнер
    // Nest при инициализации провайдера OTP_SENDER.
    // +1: транспорт уведомлений. Без явного значения выбиралась лог-заглушка,
    // помечающая сообщения `sent` при нуле доставленных.
    // +2: напоминания о долгах и канал алертов — обе наблюдаемости, которых не
    // хватало, чтобы авария стала видимой.
    expect(report.summary.missing).toBe(10);
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Production database URL'),
        expect.stringContaining('Strong JWT secret'),
        expect.stringContaining('Production CORS allowlist'),
      ]),
    );
  });

  it('blocks unsafe dev settings without leaking secret values', () => {
    const report = buildProductionPreflightReport((name) =>
      ({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/alistore',
        JWT_SECRET: 'dev-insecure-change-me',
        AUTH_OTP_DEV_ECHO: 'true',
        RESERVATION_SWEEP_ENABLED: 'false',
        OUTBOX_RELAY_ENABLED: 'false',
        REFUND_RELAY_ENABLED: 'true',
        PROCESS_ROLE: 'api',
        PUBLIC_DEMO_MODE: 'true',
        PAYMENT_PROVIDER: 'sandbox',
        PAYMENT_PROVIDER_CERTIFIED: 'false',
      })[name],
    );

    expect(report.status).toBe('blocked');
    expect(report.summary.unsafe).toBe(6);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('dev-insecure-change-me');
    expect(serialized).not.toContain('password');
  });

  it('keeps live production blocked while the refund adapter is not implemented', () => {
    const strongSecret = '0123456789abcdef0123456789abcdef';
    const report = buildProductionPreflightReport((name) =>
      ({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://alistore-prod.internal:5432/alistore',
        CORS_ORIGINS: 'https://ali.kg,https://admin.ali.kg',
        ALLOWED_HOSTS: 'api.ali.kg',
        JWT_SECRET: strongSecret,
        AUTH_OTP_DEV_ECHO: 'false',
        RESERVATION_SWEEP_ENABLED: 'true',
        OUTBOX_RELAY_ENABLED: 'true',
        DEBT_REMINDERS_ENABLED: 'true',
        ALERT_TELEGRAM_BOT_TOKEN: 'bot-token',
        ALERT_TELEGRAM_CHAT_ID: '-100123',
      NOTIFICATION_TRANSPORT: 'realtime',
                REFUND_RELAY_ENABLED: 'true',
        PROCESS_ROLE: 'worker',
        SMS_PROVIDER: 'disabled',
        PUBLIC_DEMO_MODE: 'false',
        PAYMENT_PROVIDER: 'production',
        PAYMENT_PROVIDER_CERTIFIED: 'true',
        JOB_BACKEND: 'bullmq',
        REDIS_URL: 'rediss://worker:queue-secret@redis.internal:6379',
      })[name],
    );

    expect(report.status).toBe('blocked');
    expect(report.summary.blockingRemaining).toBe(1);
    expect(report.checks.find((check) => check.id === 'refund_relay')?.status).toBe('unsafe');
  });

  /**
   * Магазин за наличные — законное боевое состояние, а не полумера.
   *
   * До этого кейса `refund_relay` считался пройденным только при
   * demo+sandbox+uncertified, а значит выключение демо-режима не запускало
   * магазин, а роняло старт: `assertProductionRuntimeReady` бросает на любой
   * непройденной проверке. Продавать за наличные можно без платёжного шлюза, и
   * преflight обязан это допускать.
   */
  it('признаёт боевой режим с оплатой только при получении', () => {
    const base = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://alistore.internal:5432/alistore',
      CORS_ORIGINS: 'https://ali.kg',
      ALLOWED_HOSTS: 'api.ali.kg',
      JWT_SECRET: '0123456789abcdef0123456789abcdef',
      AUTH_OTP_DEV_ECHO: 'false',
      RESERVATION_SWEEP_ENABLED: 'true',
      OUTBOX_RELAY_ENABLED: 'true',
      DEBT_REMINDERS_ENABLED: 'true',
      ALERT_TELEGRAM_BOT_TOKEN: 'bot-token',
      ALERT_TELEGRAM_CHAT_ID: '-100123',
      NOTIFICATION_TRANSPORT: 'realtime',
      SMS_PROVIDER: 'disabled',
      PUBLIC_DEMO_MODE: 'false',
      PAYMENT_PROVIDER: 'none',
      PAYMENT_PROVIDER_CERTIFIED: 'false',
      JOB_BACKEND: 'bullmq',
      REDIS_URL: 'rediss://worker:queue-secret@redis.internal:6379',
      PROCESS_ROLE: 'api',
    };

    const ready = buildProductionPreflightReport(
      (name) => ({ ...base, REFUND_RELAY_ENABLED: 'false' })[name],
    );
    expect(ready.checks.find((check) => check.id === 'refund_relay')?.status).toBe('ready');
    expect(ready.status).toBe('ready');

    // Провайдерских возвратов при оплате наличными не существует — релею нечего
    // делать, и включённым он остаётся небезопасным.
    const relayOn = buildProductionPreflightReport(
      (name) => ({ ...base, REFUND_RELAY_ENABLED: 'true' })[name],
    );
    expect(relayOn.checks.find((check) => check.id === 'refund_relay')?.status).toBe('unsafe');
  });

  it('accepts the Render sandbox worker relay and rejects the same relay on the API role', () => {
    const base = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://alistore.internal:5432/alistore_demo',
      CORS_ORIGINS: 'https://staging.ali.kg,https://admin-staging.ali.kg',
      ALLOWED_HOSTS: 'api-staging.ali.kg',
      JWT_SECRET: '0123456789abcdef0123456789abcdef',
      AUTH_OTP_DEV_ECHO: 'false',
      RESERVATION_SWEEP_ENABLED: 'true',
      OUTBOX_RELAY_ENABLED: 'true',
      DEBT_REMINDERS_ENABLED: 'true',
      ALERT_TELEGRAM_BOT_TOKEN: 'bot-token',
      ALERT_TELEGRAM_CHAT_ID: '-100123',
      NOTIFICATION_TRANSPORT: 'realtime',
      REFUND_RELAY_ENABLED: 'true',
      SMS_PROVIDER: 'disabled',
      PUBLIC_DEMO_MODE: 'true',
      PAYMENT_PROVIDER: 'sandbox',
      PAYMENT_PROVIDER_CERTIFIED: 'false',
      JOB_BACKEND: 'bullmq',
      REDIS_URL: 'rediss://worker:queue-secret@redis.internal:6379',
    };
    const worker = buildProductionPreflightReport((name) => ({ ...base, PROCESS_ROLE: 'worker' })[name]);
    const api = buildProductionPreflightReport((name) => ({ ...base, PROCESS_ROLE: 'api' })[name]);

    expect(worker.status).toBe('ready');
    expect(worker.checks.find((check) => check.id === 'refund_relay')?.status).toBe('ready');
    expect(api.checks.find((check) => check.id === 'refund_relay')?.status).toBe('unsafe');
  });

  it('fails application startup in unsafe production without leaking values', () => {
    const secret = 'unsafe-secret-value';
    const env = (name: string) => ({
      NODE_ENV: 'production',
      DATABASE_URL: '',
      JWT_SECRET: secret,
      AUTH_OTP_DEV_ECHO: 'true',
    })[name];
    expect(() => assertProductionRuntimeReady(env)).toThrow('Production runtime preflight failed');
    try {
      assertProductionRuntimeReady(env);
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
    expect(() => assertProductionRuntimeReady(() => undefined)).not.toThrow();
  });
});
