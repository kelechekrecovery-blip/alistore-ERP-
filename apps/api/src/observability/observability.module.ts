import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ErrorReporter } from './error-reporter';
import { SentryExceptionFilter } from './sentry-exception.filter';

/**
 * Error tracking (Sentry / GlitchTip). Registers a global exception filter that
 * reports to Sentry when SENTRY_DSN is set; otherwise a safe no-op.
 */
@Module({
  providers: [
    ErrorReporter,
    { provide: APP_FILTER, useClass: SentryExceptionFilter },
  ],
  exports: [ErrorReporter],
})
export class ObservabilityModule {}
