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
      POS_HARDWARE_CERTIFIED: 'true',
    };

    const report = buildExternalReadinessReport((name) => env[name]);

    expect(report.status).toBe('ready');
    expect(report.summary.blockingRemaining).toBe(0);
    expect(report.nextActions).toEqual([]);
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
});
