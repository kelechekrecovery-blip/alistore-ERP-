import { buildProductionPreflightReport } from '../src/health/production-preflight';

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
        })[name],
      new Date('2026-07-08T00:00:00.000Z'),
    );

    expect(report.status).toBe('blocked');
    expect(report.generatedAt).toBe('2026-07-08T00:00:00.000Z');
    expect(report.summary.missing).toBe(2);
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Production database URL'),
        expect.stringContaining('Strong JWT secret'),
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
      })[name],
    );

    expect(report.status).toBe('blocked');
    expect(report.summary.unsafe).toBe(5);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('dev-insecure-change-me');
    expect(serialized).not.toContain('password');
  });

  it('returns ready for a hardened production core config', () => {
    const strongSecret = '0123456789abcdef0123456789abcdef';
    const report = buildProductionPreflightReport((name) =>
      ({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://alistore-prod.internal:5432/alistore',
        JWT_SECRET: strongSecret,
        AUTH_OTP_DEV_ECHO: 'false',
        RESERVATION_SWEEP_ENABLED: 'true',
        OUTBOX_RELAY_ENABLED: 'true',
      })[name],
    );

    expect(report.status).toBe('ready');
    expect(report.summary.blockingRemaining).toBe(0);
    expect(report.nextActions).toEqual([]);
  });
});
