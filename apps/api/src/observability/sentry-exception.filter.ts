import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Request } from 'express';
import { AlerterService } from './alerter.service';
import { ErrorReporter } from './error-reporter';

/**
 * Only server-side failures page the ops channel: expected client errors
 * (4xx HttpException) are routine and must not alert.
 */
export function isCriticalException(exception: unknown): boolean {
  if (exception instanceof HttpException) return exception.getStatus() >= 500;
  return true;
}

/**
 * Global filter: reports the exception to Sentry (when enabled), pages the
 * alert channel on critical (5xx / unknown) failures, then defers to Nest's
 * default handling so HTTP responses are unchanged.
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  constructor(
    private readonly reporter: ErrorReporter,
    private readonly alerter: AlerterService,
  ) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    this.reporter.capture(exception);
    if (isCriticalException(exception)) {
      const request = host.switchToHttp().getRequest<Request | undefined>();
      const route = `${request?.method ?? 'HTTP'} ${(request?.originalUrl ?? request?.url ?? '').split('?')[0] || 'unknown'}`;
      const name = exception instanceof Error ? exception.name : 'Error';
      this.alerter.notifyCritical({
        source: 'api',
        message: `Unhandled ${name} on ${route}`,
        error: exception,
      });
    }
    super.catch(exception, host);
  }
}
