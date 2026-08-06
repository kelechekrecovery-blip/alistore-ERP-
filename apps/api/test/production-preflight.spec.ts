import { assertProductionRuntimeReady, buildProductionPreflightReport } from '../src/health/production-preflight';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

describe('Production preflight report', () => {
  it('blocks the production example until real core settings are filled', () => {
    const report = buildProductionPreflightReport(
      (name) =>
        ({
          NODE_ENV: 'production',
          DATABASE_URL: '',
          JWT_SECRET: '',
          AUTH_OTP_DEV_ECHO: 'false',
          SMTP_HOST: '',
          SMTP_FROM: '',
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
    // +1: media_storage — без объектного хранилища доказательства (паспорта)
    // раздаются публично с диска без подписи.
    expect(report.summary.missing).toBe(12);
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

  it('blocks production until email verification can deliver a real code', () => {
    const emailCheck = (env: Record<string, string>) =>
      buildProductionPreflightReport((name) => env[name]).checks.find(
        (check) => check.id === 'email_otp_delivery',
      );

    expect(emailCheck({})?.status).toBe('missing');
    expect(emailCheck({ SMTP_HOST: 'smtp.provider.test' })?.status).toBe('missing');
    expect(
      emailCheck({
        SMTP_HOST: 'smtp.provider.test',
        SMTP_FROM: 'AliStore <no-reply@ali.kg>',
      })?.status,
    ).toBe('ready');
  });

  it('requires complete Apple revocation credentials when Apple login is enabled', () => {
    const appleCheck = (values: Record<string, string>) =>
      buildProductionPreflightReport((name) => values[name]).checks.find(
        (check) => check.id === 'apple_oauth_revocation',
      );

    expect(appleCheck({})?.status).toBe('ready');
    expect(appleCheck({ APPLE_CLIENT_ID: 'kg.alistore.client' })?.status).toBe('missing');
    const privateKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
      .privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const configured = {
      APPLE_CLIENT_ID: 'kg.alistore.web,kg.alistore.client',
      APPLE_WEB_CLIENT_ID: 'kg.alistore.web',
      APPLE_REDIRECT_URI: 'https://ali.kg/login',
      APPLE_TEAM_ID: 'ZYU3F8W56P',
      APPLE_KEY_ID: 'ALISTORE01',
      APPLE_PRIVATE_KEY: privateKey,
      APPLE_TOKEN_ENCRYPTION_KEYS_JSON: JSON.stringify({
        primary: randomBytes(32).toString('base64'),
      }),
      APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'primary',
    };
    expect(appleCheck({ ...configured, PROCESS_ROLE: 'api' })?.status).toBe('ready');
    expect(appleCheck({ ...configured, APPLE_PRIVATE_KEY: 'not-a-key' })?.status).toBe('unsafe');
    expect(appleCheck({
      ...configured,
      APPLE_TOKEN_ENCRYPTION_KEYS_JSON: JSON.stringify({
        primary: randomBytes(32).toString('base64'),
        'bad.key': 'not-a-key',
      }),
    })?.status).toBe('unsafe');
    expect(appleCheck({ ...configured, PROCESS_ROLE: 'worker' })?.status).toBe('unsafe');
    expect(appleCheck({
      ...configured,
      PROCESS_ROLE: 'worker',
      APPLE_REVOCATION_RELAY_ENABLED: 'true',
    })?.status).toBe('ready');
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
        SMTP_HOST: 'smtp.provider.test',
        SMTP_FROM: 'AliStore <no-reply@ali.kg>',
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
        MEDIA_STORAGE: 's3',
        S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
        MINIO_BUCKET: 'alistore-media-prod',
        MINIO_ROOT_USER: 'access-key',
        MINIO_ROOT_PASSWORD: 'secret-key',
      })[name],
    );

    expect(report.status).toBe('blocked');
    expect(report.summary.blockingRemaining).toBe(1);
    expect(report.checks.find((check) => check.id === 'refund_relay')?.status).toBe('unsafe');
  });

  describe('BullMQ Redis runtime', () => {
    const redisCheck = (url: string) =>
      buildProductionPreflightReport((name) => ({
        JOB_BACKEND: 'bullmq',
        REDIS_URL: url,
      })[name]).checks.find((check) => check.id === 'bullmq_runtime');

    it('accepts protected loopback Redis without a password', () => {
      expect(redisCheck('redis://127.0.0.1:6379')?.status).toBe('ready');
      expect(redisCheck('redis://localhost:6379')?.status).toBe('ready');
      expect(redisCheck('redis://[::1]:6379')?.status).toBe('ready');
    });

    it('still requires authentication for every non-loopback Redis host', () => {
      expect(redisCheck('redis://redis.internal:6379')?.status).toBe('unsafe');
      expect(redisCheck('rediss://worker:secret@redis.internal:6379')?.status).toBe('ready');
    });
  });

  /**
   * Мост через Android-телефон — четвёртое допустимое значение SMS_PROVIDER.
   * Проверка та же самая, что однажды поймала `silent` в блюпринте: селектор
   * вызывается в `useFactory` провайдера OTP_SENDER, поэтому неизвестное
   * значение роняет контейнер Nest до первого запроса.
   */
  describe('media storage: доказательства не должны раздаваться публично с диска', () => {
    const base: Record<string, string> = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://alistore.internal:5432/alistore',
      CORS_ORIGINS: 'https://ali.kg',
      ALLOWED_HOSTS: 'api.ali.kg',
      JWT_SECRET: '0123456789abcdef0123456789abcdef',
      AUTH_OTP_DEV_ECHO: 'false',
      SMTP_HOST: 'smtp.provider.test',
      SMTP_FROM: 'AliStore <no-reply@ali.kg>',
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
      REFUND_RELAY_ENABLED: 'false',
    };
    const mediaCheck = (env: Record<string, string>) =>
      buildProductionPreflightReport((name) => env[name]).checks.find((check) => check.id === 'media_storage');

    // LocalDiskStorage — дефолт: `getReadUrl` отдаёт публичный путь, а main.ts
    // раздаёт весь ./uploads через useStaticAssets без auth. Паспорт продавца
    // оказывается публично скачиваемым по угадываемому ключу.
    it('блокирует прод без объектного хранилища с подписанными URL', () => {
      expect(mediaCheck(base)?.status).toBe('missing');
      expect(mediaCheck({ ...base, MEDIA_STORAGE: 'local' })?.status).toBe('missing');
    });

    it('требует полный S3/R2 набор, а не только переключатель режима', () => {
      expect(mediaCheck({ ...base, MEDIA_STORAGE: 's3' })?.status).toBe('missing');
      expect(mediaCheck({
        ...base,
        MEDIA_STORAGE: 's3',
        S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
        MINIO_BUCKET: 'alistore-media-prod',
        MINIO_ROOT_USER: 'access-key',
        MINIO_ROOT_PASSWORD: 'secret-key',
      })?.status).toBe('ready');
    });
  });

  describe('SMS provider value: Android gateway bridge', () => {
    const gateway: Record<string, string> = {
      SMS_PROVIDER: 'android_gateway',
      SMS_GATEWAY_URL: 'https://api.sms-gate.app/3rdparty/v1',
      SMS_GATEWAY_USERNAME: 'device-user',
      SMS_GATEWAY_PASSWORD: 'device-pass',
      SMS_GATEWAY_ENCRYPTION_PASSPHRASE: 'passphrase',
    };
    const smsCheck = (env: Record<string, string>) =>
      buildProductionPreflightReport((name) => env[name])
        .checks.find((check) => check.id === 'sms_provider_value');

    it('принимает режим при полном наборе переменных', () => {
      expect(smsCheck(gateway)?.status).toBe('ready');
    });

    it('отвергает режим без парольной фразы — иначе код уйдёт в облако открытым', () => {
      expect(smsCheck({ ...gateway, SMS_GATEWAY_ENCRYPTION_PASSPHRASE: '' })?.status).toBe('unsafe');
    });

    it('отвергает режим без адреса или учётных данных шлюза', () => {
      expect(smsCheck({ ...gateway, SMS_GATEWAY_URL: '' })?.status).toBe('unsafe');
      expect(smsCheck({ ...gateway, SMS_GATEWAY_PASSWORD: '' })?.status).toBe('unsafe');
    });
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
      SMTP_HOST: 'smtp.provider.test',
      SMTP_FROM: 'AliStore <no-reply@ali.kg>',
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
      MEDIA_STORAGE: 's3',
      S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      MINIO_BUCKET: 'alistore-media-prod',
      MINIO_ROOT_USER: 'access-key',
      MINIO_ROOT_PASSWORD: 'secret-key',
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
      SMTP_HOST: 'smtp.provider.test',
      SMTP_FROM: 'AliStore <no-reply@ali.kg>',
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
      MEDIA_STORAGE: 's3',
      S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      MINIO_BUCKET: 'alistore-media-prod',
      MINIO_ROOT_USER: 'access-key',
      MINIO_ROOT_PASSWORD: 'secret-key',
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
