import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { ErrorReporter } from './error-reporter';

/**
 * Global filter: reports the exception to Sentry (when enabled), then defers to
 * Nest's default handling so HTTP responses are unchanged.
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  constructor(private readonly reporter: ErrorReporter) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    this.reporter.capture(exception);
    super.catch(exception, host);
  }
}
