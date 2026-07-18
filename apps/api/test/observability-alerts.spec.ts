import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { AlerterService } from '../src/observability/alerter.service';
import { isCriticalException } from '../src/observability/sentry-exception.filter';

describe('observability alerting', () => {
  const config = (values: Record<string, string> = {}) =>
    ({ get: (name: string) => values[name] } as unknown as ConfigService);

  it('pages only server-side failures', () => {
    expect(isCriticalException(new HttpException('bad request', 400))).toBe(false);
    expect(isCriticalException(new HttpException('server error', 500))).toBe(true);
    expect(isCriticalException(new Error('unknown failure'))).toBe(true);
  });

  it('keeps a bounded local record and suppresses duplicate alerts when unconfigured', () => {
    const alerter = new AlerterService(config());

    alerter.notifyCritical({ source: 'api', message: 'GET /orders/123 failed' });
    alerter.notifyCritical({ source: 'api', message: 'GET /orders/123 failed' });

    expect(alerter.enabled).toBe(false);
    expect(alerter.recentAlerts()).toHaveLength(1);
    expect(alerter.recentAlerts()[0]).toMatchObject({
      source: 'api',
      message: 'GET /orders/123 failed',
      delivered: false,
    });
    expect(alerter.suppressedCount).toBe(1);
  });

  it('does not expose query credentials in local records', () => {
    const alerter = new AlerterService(config());

    alerter.notifyCritical({
      source: 'api',
      message: 'provider failed?token=secret-token',
      error: new Error('secret-token'),
    });

    expect(alerter.recentAlerts()[0].message).not.toContain('secret-token');
  });
});
