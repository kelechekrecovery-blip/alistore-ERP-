import { buildExternalReadinessReport } from '../src/health/external-readiness';

describe('External readiness report', () => {
  it('marks external blockers missing without leaking secret values', () => {
    const report = buildExternalReadinessReport(
      (name) =>
        ({
          AI_PROVIDER_KEY: 'sk-secret-ai',
          TELEGRAM_BOT_TOKEN: '123:telegram-secret',
        })[name],
      new Date('2026-07-08T00:00:00.000Z'),
    );

    expect(report.status).toBe('blocked');
    expect(report.generatedAt).toBe('2026-07-08T00:00:00.000Z');
    const aiProvider = report.checks.find((check) => check.id === 'ai_provider');
    expect(aiProvider?.status).toBe('ready');
    expect(aiProvider?.missingEnv).toEqual([]);
    expect(report.checks.find((check) => check.id === 'telegram_bot')?.status).toBe('ready');
    expect(report.checks.find((check) => check.id === 'pos_hardware')?.status).toBe('manual_required');
    expect(report.nextActions.length).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toContain('sk-secret-ai');
    expect(JSON.stringify(report)).not.toContain('telegram-secret');
  });

  it('returns ready when every blocking integration is configured or certified', () => {
    const env: Record<string, string> = {
      AI_PROVIDER_KEY: 'set',
      SMS_PROVIDER: 'production',
      SMS_API_URL: 'https://sms.example.test',
      SMS_API_KEY: 'set',
      SMS_SENDER_ID: 'AliStore',
      SMS_PROVIDER_CERTIFIED: 'true',
      PAYMENT_PROVIDER: 'production',
      PAYMENT_API_URL: 'https://payments.example.test',
      PAYMENT_MERCHANT_ID: 'set',
      PAYMENT_API_KEY: 'set',
      PAYMENT_WEBHOOK_SECRET: 'set',
      PAYMENT_PROVIDER_CERTIFIED: 'true',
      TELEGRAM_BOT_TOKEN: 'set',
      WHATSAPP_ACCESS_TOKEN: 'set',
      WHATSAPP_PHONE_NUMBER_ID: 'set',
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'set',
      APPLE_CLIENT_ID: 'set',
      APPLE_TEAM_ID: 'set',
      APPLE_KEY_ID: 'set',
      APPLE_PRIVATE_KEY: 'set',
      NOTIFICATION_TRANSPORT: 'channels',
      NOVU_API_KEY: 'set',
      FCM_SERVICE_ACCOUNT_JSON: '{"project_id":"test"}',
      FCM_PROVIDER_CERTIFIED: 'true',
      POS_HARDWARE_CERTIFIED: 'true',
      S3_ENDPOINT: 'https://account.eu.r2.cloudflarestorage.com',
      MINIO_BUCKET: 'alistore-media-prod',
      MINIO_ROOT_USER: 'set',
      MINIO_ROOT_PASSWORD: 'set',
      SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
    };

    const report = buildExternalReadinessReport((name) => env[name]);

    expect(report.status).toBe('ready');
    expect(report.summary.blockingRemaining).toBe(0);
    expect(report.nextActions).toEqual([]);
  });

  /**
   * Мост через Android-телефон закрывает *работоспособность* доставки OTP, но
   * не сертификацию. Настроенный шлюз обязан снимать статус `missing` — иначе
   * дашборд врёт, что входа нет, хотя он работает, — но оставаться
   * `manual_required`, пока не появится договор с оператором. Маркер
   * `SMS_PROVIDER_CERTIFIED` этот срез НЕ выставляет ни при каких условиях.
   */
  it('recognises the Android gateway bridge but keeps SMS certification manual', () => {
    const report = buildExternalReadinessReport(
      (name) =>
        ({
          SMS_PROVIDER: 'android_gateway',
          SMS_GATEWAY_URL: 'https://api.sms-gate.app/3rdparty/v1',
          SMS_GATEWAY_USERNAME: 'device-user',
          SMS_GATEWAY_PASSWORD: 'device-secret',
          SMS_GATEWAY_ENCRYPTION_PASSPHRASE: 'passphrase-secret',
        })[name],
    );
    const sms = report.checks.find((check) => check.id === 'sms_provider');
    expect(sms?.status).toBe('manual_required');
    expect(sms?.missingEnv).toEqual([]);
    // Секреты устройства не утекают в отчёт.
    expect(JSON.stringify(report)).not.toContain('device-secret');
    expect(JSON.stringify(report)).not.toContain('passphrase-secret');
  });

  it('still reports SMS missing when neither a provider nor the bridge is configured', () => {
    const report = buildExternalReadinessReport(() => undefined);
    expect(report.checks.find((check) => check.id === 'sms_provider')?.status).toBe('missing');
  });

  it('accepts direct channel provider credentials for campaign delivery', () => {
    const telegramReport = buildExternalReadinessReport(
      (name) =>
        ({ NOTIFICATION_TRANSPORT: 'channels', TELEGRAM_BOT_TOKEN: 'set' })[
          name
        ],
    );
    expect(
      telegramReport.checks.find((check) => check.id === 'campaign_delivery')?.status,
    ).toBe('ready');

    const whatsappReport = buildExternalReadinessReport(
      (name) =>
        ({
          NOTIFICATION_TRANSPORT: 'channels',
          WHATSAPP_ACCESS_TOKEN: 'set',
          WHATSAPP_PHONE_NUMBER_ID: 'set',
        })[name],
    );
    expect(
      whatsappReport.checks.find((check) => check.id === 'campaign_delivery')?.status,
    ).toBe('ready');
  });

  it('keeps a fully configured payment gateway manual until live certification', () => {
    const env: Record<string, string> = {
      PAYMENT_PROVIDER: 'production',
      PAYMENT_API_URL: 'https://payments.example.test',
      PAYMENT_MERCHANT_ID: 'set',
      PAYMENT_API_KEY: 'set',
      PAYMENT_WEBHOOK_SECRET: 'set',
      PAYMENT_PROVIDER_CERTIFIED: 'false',
    };
    const payment = buildExternalReadinessReport((name) => env[name]).checks
      .find((check) => check.id === 'payment_gateway');
    expect(payment?.status).toBe('manual_required');
    expect(payment?.blocking).toBe(true);
  });

  it('keeps FCM manual until physical-device delivery is certified', () => {
    const env = { FCM_SERVICE_ACCOUNT_KEY_PATH: '/run/secrets/fcm.json', FCM_PROVIDER_CERTIFIED: 'false' };
    const push = buildExternalReadinessReport((name) => env[name as keyof typeof env]).checks
      .find((check) => check.id === 'native_push_android');
    expect(push).toMatchObject({ status: 'manual_required', blocking: true, missingEnv: [] });
  });

  it('makes live providers optional in public demo but still requires private storage and monitoring', () => {
    const env: Record<string, string> = {
      PUBLIC_DEMO_MODE: 'true',
      PAYMENT_PROVIDER: 'sandbox',
      PAYMENT_PROVIDER_CERTIFIED: 'false',
      SMS_PROVIDER_CERTIFIED: 'false',
      POS_HARDWARE_CERTIFIED: 'false',
      S3_ENDPOINT: 'https://account.eu.r2.cloudflarestorage.com',
      MINIO_BUCKET: 'alistore-media-prod',
      MINIO_ROOT_USER: 'set',
      MINIO_ROOT_PASSWORD: 'set',
      SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
    };
    const report = buildExternalReadinessReport((name) => env[name]);

    expect(report.status).toBe('ready');
    expect(report.summary.blockingRemaining).toBe(0);
    expect(report.checks.find((check) => check.id === 'payment_gateway')).toMatchObject({ blocking: false });
    expect(report.checks.find((check) => check.id === 's3_media_storage')).toMatchObject({ status: 'ready', blocking: true });
  });
});
