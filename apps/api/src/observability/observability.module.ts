import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AlerterService } from './alerter.service';
import { ErrorReporter } from './error-reporter';
import { SentryExceptionFilter } from './sentry-exception.filter';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';
import { StatusController } from './status.controller';

/**
 * Error tracking (Sentry / GlitchTip), Prometheus metrics, the critical-alert
 * channel (Telegram ops chat) and the protected operations status endpoint.
 * Registers a global exception filter that reports to Sentry and pages on 5xx;
 * all channels are safe no-ops until their env config is set.
 */
@Module({
  imports: [ConfigModule, AuthzModule, StaffAuthModule],
  controllers: [MetricsController, StatusController],
  providers: [
    ErrorReporter,
    AlerterService,
    MetricsService,
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_FILTER, useClass: SentryExceptionFilter },
  ],
  exports: [ErrorReporter, AlerterService, MetricsService],
})
export class ObservabilityModule {}
