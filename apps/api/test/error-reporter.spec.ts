jest.mock('@sentry/node', () => ({ init: jest.fn(), captureException: jest.fn() }));
import * as Sentry from '@sentry/node';
import { ConfigService } from '@nestjs/config';
import { ErrorReporter } from '../src/observability/error-reporter';

describe('ErrorReporter (Sentry)', () => {
  afterEach(() => jest.clearAllMocks());

  it('captures exceptions when SENTRY_DSN is configured', () => {
    const config = {
      get: (key: string) =>
        key === 'SENTRY_DSN' ? 'https://key@sentry.example/1' : undefined,
    } as unknown as ConfigService;

    const reporter = new ErrorReporter(config);
    expect(reporter.enabled).toBe(true);
    expect(Sentry.init).toHaveBeenCalledTimes(1);

    reporter.capture(new Error('boom'));
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('is a no-op without SENTRY_DSN (never phones home in dev/tests)', () => {
    const config = { get: () => undefined } as unknown as ConfigService;

    const reporter = new ErrorReporter(config);
    expect(reporter.enabled).toBe(false);

    reporter.capture(new Error('x'));
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
