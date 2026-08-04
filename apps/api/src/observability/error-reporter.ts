import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';

/**
 * Error reporting to Sentry (self-hosted GlitchTip/Sentry or cloud). A no-op
 * unless SENTRY_DSN is set, so dev/tests never phone home. Fed by the global
 * exception filter to capture unhandled errors with context.
 */
@Injectable()
export class ErrorReporter {
  private readonly logger = new Logger(ErrorReporter.name);
  readonly enabled: boolean;

  constructor(config: ConfigService) {
    const dsn = config.get<string>('SENTRY_DSN');
    this.enabled = Boolean(dsn);
    if (this.enabled) {
      Sentry.init({
        dsn,
        environment: config.get<string>('NODE_ENV') ?? 'development',
        tracesSampleRate: 0,
      });
      this.logger.log('Sentry error reporting enabled');
    }
  }

  capture(exception: unknown): void {
    if (this.enabled) {
      Sentry.captureException(exception);
    }
  }
}
