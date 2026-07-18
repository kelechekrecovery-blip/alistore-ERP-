import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ErrorReporter } from './error-reporter';
import { SentryExceptionFilter } from './sentry-exception.filter';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

/**
 * Error tracking (Sentry / GlitchTip). Registers a global exception filter that
 * reports to Sentry when SENTRY_DSN is set; otherwise a safe no-op.
 */
@Module({
  imports: [ConfigModule],
  controllers: [MetricsController],
  providers: [
    ErrorReporter,
    MetricsService,
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_FILTER, useClass: SentryExceptionFilter },
  ],
  exports: [ErrorReporter, MetricsService],
})
export class ObservabilityModule {}
