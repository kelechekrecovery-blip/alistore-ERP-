import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildExternalReadinessReport,
  externalReadinessEnvNames,
  projectLegacyExternalReadinessReport,
} from '../src/health/external-readiness';
import { strictReadinessExitCode } from '../scripts/readiness-cli-policy';

describe('External readiness report', () => {
  it('exposes every Gate 0 operational row with the exact public status vocabulary', () => {
    const report = buildExternalReadinessReport(() => undefined);
    const checks = new Map(report.checks.map((check) => [check.id, check]));

    expect([...checks.keys()]).toEqual(expect.arrayContaining([
      'native_push_ios',
      'outbox_health',
      'meilisearch',
      'native_links',
      'backup_restore',
      'partner_payout_provider',
    ]));
    for (const check of report.checks) {
      expect(['missing', 'configured', 'certified', 'blocked']).toContain(check.status);
    }
    expect(checks.get('native_push_ios')).toMatchObject({ status: 'missing', blocking: true });
    expect(checks.get('outbox_health')).toMatchObject({ status: 'missing', blocking: true });
    expect(checks.get('meilisearch')).toMatchObject({ status: 'missing', blocking: true });
    expect(checks.get('native_links')).toMatchObject({ status: 'missing', blocking: true });
    expect(checks.get('backup_restore')).toMatchObject({ status: 'missing', blocking: true });
    expect(checks.get('partner_payout_provider')).toMatchObject({ status: 'missing', blocking: true });
    expect(report).toMatchObject({ contractVersion: 2, mode: 'production' });
  });

  it('projects v2 to the legacy v1 contract so an old Web deploy keeps rendering', () => {
    const v2 = buildExternalReadinessReport((name) => ({
      AI_PROVIDER_KEY: 'set',
      AI_PROVIDER_CERTIFIED: 'false',
      SENTRY_DSN: 'set',
      OBSERVABILITY_CERTIFIED: 'true',
    })[name]);

    const v1 = projectLegacyExternalReadinessReport(v2);

    expect(v1).not.toHaveProperty('contractVersion');
    expect(v1).not.toHaveProperty('mode');
    expect(v1.checks.find((check) => check.id === 'ai_provider')).toMatchObject({
      status: 'manual_required',
    });
    expect(v1.checks.find((check) => check.id === 'observability')).toMatchObject({
      status: 'ready',
    });
    expect(v1.checks.every((check) =>
      ['ready', 'missing', 'manual_required', 'optional'].includes(check.status))).toBe(true);
  });

  it('makes strict readiness fail closed in demo mode even when the demo contour is ready', () => {
    const report = buildExternalReadinessReport((name) => ({
      PUBLIC_DEMO_MODE: 'true',
      S3_ENDPOINT: 'set',
      MINIO_BUCKET: 'set',
      MINIO_ROOT_USER: 'set',
      MINIO_ROOT_PASSWORD: 'set',
      S3_MEDIA_STORAGE_CERTIFIED: 'true',
      SENTRY_DSN: 'set',
      OBSERVABILITY_CERTIFIED: 'true',
    })[name]);

    expect(report).toMatchObject({ mode: 'demo', status: 'ready' });
    expect(strictReadinessExitCode(report, true)).toBe(1);
    expect(strictReadinessExitCode(report, false)).toBe(0);
    expect(projectLegacyExternalReadinessReport(report).status).toBe('blocked');
  });

  it('requires operator deployment attestations for every blocking external/live row', () => {
    const env: Record<string, string> = {
      AI_PROVIDER_KEY: 'set',
      TELEGRAM_BOT_TOKEN: 'set',
      TELEGRAM_WEBHOOK_SECRET: 'set',
      TELEGRAM_WEBHOOK_URL: 'https://api.example.test/telegram',
      WHATSAPP_ACCESS_TOKEN: 'set',
      WHATSAPP_PHONE_NUMBER_ID: 'set',
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'set',
      APPLE_CLIENT_ID: 'set',
      GOOGLE_CLIENT_ID: 'web.apps.googleusercontent.com',
      GOOGLE_WEB_CLIENT_ID: 'web.apps.googleusercontent.com',
      NOTIFICATION_TRANSPORT: 'channels',
      NOVU_API_KEY: 'set',
      S3_ENDPOINT: 'set',
      MINIO_BUCKET: 'set',
      MINIO_ROOT_USER: 'set',
      MINIO_ROOT_PASSWORD: 'set',
      SENTRY_DSN: 'set',
    };
    const report = buildExternalReadinessReport((name) => env[name]);
    const expected: Record<string, string> = {
      ai_provider: 'AI_PROVIDER_CERTIFIED',
      telegram_bot: 'TELEGRAM_BOT_CERTIFIED',
      whatsapp_business: 'WHATSAPP_BUSINESS_CERTIFIED',
      apple_social_login: 'APPLE_SOCIAL_LOGIN_CERTIFIED',
      google_social_login: 'GOOGLE_SOCIAL_LOGIN_CERTIFIED',
      telegram_social_login: 'TELEGRAM_SOCIAL_LOGIN_CERTIFIED',
      campaign_delivery: 'CAMPAIGN_DELIVERY_CERTIFIED',
      s3_media_storage: 'S3_MEDIA_STORAGE_CERTIFIED',
      observability: 'OBSERVABILITY_CERTIFIED',
    };

    for (const [id, attestationEnv] of Object.entries(expected)) {
      expect(report.checks.find((check) => check.id === id)).toMatchObject({
        status: 'configured',
        blocking: true,
        attestationRequired: true,
        attestationEnv,
      });
    }
    expect(report.status).toBe('blocked');
  });

  it('declares every required and attestation env in the canonical production template', () => {
    const template = readFileSync(resolve(__dirname, '../.env.production.example'), 'utf8');
    const declared = new Set(
      [...template.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]),
    );
    const missing = externalReadinessEnvNames().filter((name) => !declared.has(name));

    expect(missing).toEqual([]);
    expect(template).toContain('mirrored into both the API and Web deployments');
  });

  it('never infers Gate 0 certification from configured credentials or leaks their values', () => {
    const env: Record<string, string> = {
      APNS_KEY_ID: 'apns-key-secret',
      APNS_TEAM_ID: 'apns-team-secret',
      OUTBOX_RELAY_ENABLED: 'true',
      NOTIFICATION_TRANSPORT: 'channels',
      OUTBOX_MAX_PENDING_AGE_SECONDS: '300',
      OUTBOX_MAX_DLQ_AGE_SECONDS: '900',
      MEILI_HOST: 'https://search.internal.example.test',
      MEILI_API_KEY: 'meili-master-secret',
      APPLE_TEAM_ID: 'apple-team-secret',
      ANDROID_APP_LINK_SHA256: 'AA:BB:CC:secret-fingerprint',
      S3_BACKUP_BUCKET: 'alistore-backups-prod-secret',
      PARTNER_PAYOUT_PROVIDER: 'bank-provider-secret',
    };
    const report = buildExternalReadinessReport((name) => env[name]);
    const checks = new Map(report.checks.map((check) => [check.id, check]));

    for (const id of [
      'native_push_ios',
      'outbox_health',
      'meilisearch',
      'native_links',
      'backup_restore',
      'partner_payout_provider',
    ]) {
      expect(checks.get(id)).toMatchObject({ status: 'configured', blocking: true });
    }
    const serialized = JSON.stringify(report);
    for (const secret of [
      'apns-key-secret',
      'apns-team-secret',
      'meili-master-secret',
      'apple-team-secret',
      'AA:BB:CC:secret-fingerprint',
      'alistore-backups-prod-secret',
      'bank-provider-secret',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('marks Gate 0 operational rows certified only with explicit operator attestations', () => {
    const env: Record<string, string> = {
      APNS_KEY_ID: 'set',
      APNS_TEAM_ID: 'set',
      APNS_CERTIFIED: 'true',
      OUTBOX_RELAY_ENABLED: 'true',
      NOTIFICATION_TRANSPORT: 'channels',
      OUTBOX_MAX_PENDING_AGE_SECONDS: '300',
      OUTBOX_MAX_DLQ_AGE_SECONDS: '900',
      OUTBOX_HEALTH_CERTIFIED: 'true',
      MEILI_HOST: 'https://search.internal.example.test',
      MEILI_API_KEY: 'set',
      MEILISEARCH_CERTIFIED: 'true',
      APPLE_TEAM_ID: 'set',
      ANDROID_APP_LINK_SHA256: 'AA:BB:CC',
      NATIVE_LINKS_CERTIFIED: 'true',
      S3_BACKUP_BUCKET: 'alistore-backups-prod',
      BACKUP_RESTORE_CERTIFIED: 'true',
      PARTNER_PAYOUT_PROVIDER: 'bank',
      PARTNER_PAYOUT_PROVIDER_CERTIFIED: 'true',
    };
    const report = buildExternalReadinessReport((name) => env[name]);

    for (const id of [
      'native_push_ios',
      'outbox_health',
      'meilisearch',
      'native_links',
      'backup_restore',
      'partner_payout_provider',
    ]) {
      expect(report.checks.find((check) => check.id === id)?.status).toBe('certified');
    }
  });

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
    expect(aiProvider?.status).toBe('configured');
    expect(aiProvider?.missingEnv).toEqual([]);
    expect(report.checks.find((check) => check.id === 'telegram_bot')?.status).toBe('configured');
    expect(report.checks.find((check) => check.id === 'pos_hardware')?.status).toBe('blocked');
    expect(report.nextActions.length).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toContain('sk-secret-ai');
    expect(JSON.stringify(report)).not.toContain('telegram-secret');
  });

  it('returns ready when every blocking integration is configured or certified', () => {
    const env: Record<string, string> = {
      AI_PROVIDER_KEY: 'set',
      AI_PROVIDER_CERTIFIED: 'true',
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
      FISCAL_PROVIDER: 'production',
      FISCAL_API_URL: 'https://ofd.example.test',
      FISCAL_API_KEY: 'set',
      FISCAL_PROVIDER_CERTIFIED: 'true',
      TELEGRAM_BOT_TOKEN: 'set',
      TELEGRAM_BOT_CERTIFIED: 'true',
      TELEGRAM_AGENT_ENABLED: 'true',
      TELEGRAM_WEBHOOK_SECRET: 'set',
      TELEGRAM_WEBHOOK_URL: 'https://api.example.test/api/telegram-agent/webhook',
      TELEGRAM_MINI_APP_URL: 'https://example.test/tg',
      TELEGRAM_AGENT_CERTIFIED: 'true',
      OUTBOX_RELAY_ENABLED: 'true',
      WHATSAPP_ACCESS_TOKEN: 'set',
      WHATSAPP_PHONE_NUMBER_ID: 'set',
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'set',
      WHATSAPP_BUSINESS_CERTIFIED: 'true',
      APPLE_CLIENT_ID: 'set',
      APPLE_SOCIAL_LOGIN_CERTIFIED: 'true',
      APPLE_TEAM_ID: 'set',
      APPLE_KEY_ID: 'set',
      APPLE_PRIVATE_KEY: 'set',
      GOOGLE_CLIENT_ID: 'web-client.apps.googleusercontent.com',
      GOOGLE_WEB_CLIENT_ID: 'web-client.apps.googleusercontent.com',
      GOOGLE_SOCIAL_LOGIN_CERTIFIED: 'true',
      TELEGRAM_SOCIAL_LOGIN_CERTIFIED: 'true',
      NOTIFICATION_TRANSPORT: 'channels',
      NOVU_API_KEY: 'set',
      CAMPAIGN_DELIVERY_CERTIFIED: 'true',
      FCM_SERVICE_ACCOUNT_JSON: '{"project_id":"test"}',
      FCM_PROVIDER_CERTIFIED: 'true',
      APNS_KEY_ID: 'set',
      APNS_TEAM_ID: 'set',
      APNS_CERTIFIED: 'true',
      OUTBOX_MAX_PENDING_AGE_SECONDS: '300',
      OUTBOX_MAX_DLQ_AGE_SECONDS: '900',
      OUTBOX_HEALTH_CERTIFIED: 'true',
      MEILI_HOST: 'https://search.internal.example.test',
      MEILI_API_KEY: 'set',
      MEILISEARCH_CERTIFIED: 'true',
      ANDROID_APP_LINK_SHA256: 'AA:BB:CC',
      NATIVE_LINKS_CERTIFIED: 'true',
      S3_BACKUP_BUCKET: 'alistore-backups-prod',
      BACKUP_RESTORE_CERTIFIED: 'true',
      PARTNER_PAYOUT_PROVIDER: 'bank',
      PARTNER_PAYOUT_PROVIDER_CERTIFIED: 'true',
      POS_HARDWARE_CERTIFIED: 'true',
      S3_ENDPOINT: 'https://account.eu.r2.cloudflarestorage.com',
      MINIO_BUCKET: 'alistore-media-prod',
      MINIO_ROOT_USER: 'set',
      MINIO_ROOT_PASSWORD: 'set',
      S3_MEDIA_STORAGE_CERTIFIED: 'true',
      SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
      OBSERVABILITY_CERTIFIED: 'true',
    };

    const report = buildExternalReadinessReport((name) => env[name]);

    expect(report.status).toBe('ready');
    expect(report.summary.blockingRemaining).toBe(0);
    expect(report.nextActions).toEqual([]);
  });

  it('requires both Google token audiences and an explicit web client ID', () => {
    const missingWebClient = buildExternalReadinessReport(
      (name) => ({ GOOGLE_CLIENT_ID: 'ios-client.apps.googleusercontent.com' })[name],
    );
    expect(
      missingWebClient.checks.find((check) => check.id === 'google_social_login'),
    ).toMatchObject({
      status: 'missing',
      missingEnv: ['GOOGLE_WEB_CLIENT_ID'],
    });

    const configured = buildExternalReadinessReport(
      (name) =>
        ({
          GOOGLE_CLIENT_ID: 'web-client.apps.googleusercontent.com,ios-client.apps.googleusercontent.com',
          GOOGLE_WEB_CLIENT_ID: 'web-client.apps.googleusercontent.com',
        })[name],
    );
    expect(
      configured.checks.find((check) => check.id === 'google_social_login'),
    ).toMatchObject({ status: 'configured', missingEnv: [] });

    const mismatched = buildExternalReadinessReport(
      (name) =>
        ({
          GOOGLE_CLIENT_ID: 'ios-client.apps.googleusercontent.com',
          GOOGLE_WEB_CLIENT_ID: 'web-client.apps.googleusercontent.com',
        })[name],
    );
    expect(
      mismatched.checks.find((check) => check.id === 'google_social_login'),
    ).toMatchObject({ status: 'blocked' });
  });

  /**
   * Мост через Android-телефон закрывает *работоспособность* доставки OTP, но
   * не сертификацию. Настроенный шлюз обязан снимать статус `missing` — иначе
   * дашборд врёт, что входа нет, хотя он работает, — но оставаться
   * `configured`, пока не появится договор с оператором. Маркер
   * `SMS_PROVIDER_CERTIFIED` этот срез НЕ выставляет ни при каких условиях.
   */
  it('recognises the Android gateway bridge but keeps SMS configured, not certified', () => {
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
    expect(sms?.status).toBe('configured');
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
    ).toBe('configured');

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
    ).toBe('configured');
  });

  it('blocks launch until a certified fiscalization provider is configured', () => {
    // launch:check was passing green with no fiscalization at all — a lie about
    // legality. Fiscalization must be a first-class blocking check.
    const report = buildExternalReadinessReport(() => undefined);
    const fiscal = report.checks.find((check) => check.id === 'fiscal_provider');
    expect(fiscal).toMatchObject({ status: 'missing', blocking: true, area: 'fiscal' });
    expect(report.status).toBe('blocked');
  });

  it('keeps fiscalization configured until explicitly certified', () => {
    const base: Record<string, string> = {
      FISCAL_PROVIDER: 'production',
      FISCAL_API_URL: 'https://ofd.example.test',
      FISCAL_API_KEY: 'set',
    };
    const configuredNotCertified = buildExternalReadinessReport(
      (name) => ({ ...base, FISCAL_PROVIDER_CERTIFIED: 'false' })[name],
    ).checks.find((check) => check.id === 'fiscal_provider');
    expect(configuredNotCertified).toMatchObject({ status: 'configured', blocking: true });

    const certified = buildExternalReadinessReport(
      (name) => ({ ...base, FISCAL_PROVIDER_CERTIFIED: 'true' })[name],
    ).checks.find((check) => check.id === 'fiscal_provider');
    expect(certified?.status).toBe('certified');
  });

  it('keeps a fully configured payment gateway uncertified until live certification', () => {
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
    expect(payment?.status).toBe('configured');
    expect(payment?.blocking).toBe(true);
  });

  it('keeps FCM configured until physical-device delivery is certified', () => {
    const env = { FCM_SERVICE_ACCOUNT_KEY_PATH: '/run/secrets/fcm.json', FCM_PROVIDER_CERTIFIED: 'false' };
    const push = buildExternalReadinessReport((name) => env[name as keyof typeof env]).checks
      .find((check) => check.id === 'native_push_android');
    expect(push).toMatchObject({ status: 'configured', blocking: true, missingEnv: [] });
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
      S3_MEDIA_STORAGE_CERTIFIED: 'true',
      SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
      OBSERVABILITY_CERTIFIED: 'true',
    };
    const report = buildExternalReadinessReport((name) => env[name]);

    expect(report.status).toBe('ready');
    expect(report.summary.blockingRemaining).toBe(0);
    expect(report.checks.find((check) => check.id === 'payment_gateway')).toMatchObject({ blocking: false });
    expect(report.checks.find((check) => check.id === 's3_media_storage')).toMatchObject({ status: 'certified', blocking: true });
  });
});
