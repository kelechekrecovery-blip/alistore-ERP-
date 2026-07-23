import { Module } from '@nestjs/common';
import { OwnerAlertsService } from './owner-alerts.service';
import { OwnerAlertsScheduler } from './owner-alerts.scheduler';
import { ObservabilityModule } from '../observability/observability.module';

@Module({
  imports: [ObservabilityModule],
  providers: [OwnerAlertsService, OwnerAlertsScheduler],
  exports: [OwnerAlertsService],
})
export class OwnerAlertsModule {}
