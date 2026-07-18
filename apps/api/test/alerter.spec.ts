import { ConfigService } from '@nestjs/config';
import { HttpException, NotFoundException } from '@nestjs/common';
import { AlerterService } from '../src/observability/alerter.service';
import { isCriticalException } from '../src/observability/sentry-exception.filter';

function alerter(config: Record<string, string>): AlerterService {
  return new AlerterService(new ConfigService(config));
}

const CONFIGURED = {
  ALERT_TELEGRAM_BOT_TOKEN: 'test-bot-token',
  ALERT_TELEGRAM_CHAT_ID: 'ops-chat',
};

describe('AlerterService', () => {
  const fetchMock = jest.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, text: () => Promise.resolve('') });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('is fail-silent without config: no delivery, no throw, alert still recorded', () => {
    const service = alerter({});
    expect(service.enabled).toBe(false);

    expect(() =>
      service.notifyCritical({ source: 'api', message: 'Unhandled Error on GET /api/orders' }),
    ).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();

    const recent = service.recentAlerts();
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({ source: 'api', delivered: false });
  });

  it('delivers to the Telegram Bot API when configured', async () => {
    const service = alerter(CONFIGURED);
    expect(service.enabled).toBe(true);

    service.notifyCritical({ source: 'refund-relay', message: 'Refund relay iteration failed' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bottest-bot-token/sendMessage');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.chat_id).toBe('ops-chat');
    expect(body.text).toContain('refund-relay');
    expect(body.text).toContain('Refund relay iteration failed');

    expect(service.recentAlerts()[0]).toMatchObject({ delivered: true });
  });

  it('deduplicates the same alert inside the window but alerts on distinct ones', () => {
    const service = alerter(CONFIGURED);

    for (let i = 0; i < 5; i += 1) {
      service.notifyCritical({ source: 'api', message: 'Unhandled Error on POST /api/orders' });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(service.suppressedCount).toBe(4);

    service.notifyCritical({ source: 'outbox-relay', message: 'pg-boss error in outbox relay' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('normalizes per-occurrence ids out of the dedup key', () => {
    const service = alerter(CONFIGURED);

    service.notifyCritical({
      source: 'api',
      message: 'Unhandled Error on GET /api/orders/550e8400-e29b-41d4-a716-446655440000?expand=lines',
    });
    service.notifyCritical({
      source: 'api',
      message: 'Unhandled Error on GET /api/orders/6ba7b810-9dad-11d1-80b4-00c04fd430c8?expand=lines',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rate-caps a burst of distinct critical alerts', () => {
    const service = alerter({ ...CONFIGURED, ALERT_MAX_PER_WINDOW: '3' });

    for (let i = 0; i < 6; i += 1) {
      service.notifyCritical({ source: 'api', message: `Distinct failure ${i}` });
    }

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(service.suppressedCount).toBe(3);
    // Suppressed alerts are not recorded as delivered alerts.
    expect(service.recentAlerts()).toHaveLength(3);
  });

  it('never throws when delivery fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('gateway error'),
    });
    const service = alerter(CONFIGURED);

    expect(() =>
      service.notifyCritical({ source: 'api', message: 'Unhandled Error on GET /api/x' }),
    ).not.toThrow();
    // Let the background delivery rejection settle; it must stay contained.
    await new Promise((resolve) => setImmediate(resolve));
  });
});

describe('isCriticalException', () => {
  it('does not page on expected 4xx client errors', () => {
    expect(isCriticalException(new NotFoundException('nope'))).toBe(false);
    expect(isCriticalException(new HttpException('teapot', 418))).toBe(false);
  });

  it('pages on 5xx HttpExceptions and unknown errors', () => {
    expect(isCriticalException(new HttpException('boom', 500))).toBe(true);
    expect(isCriticalException(new Error('kaboom'))).toBe(true);
    expect(isCriticalException('string failure')).toBe(true);
  });
});
