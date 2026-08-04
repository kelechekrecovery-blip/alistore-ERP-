import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { UnitsModule } from '../units/units.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ObservabilityModule } from '../observability/observability.module';
import { OrderNoShowScheduler } from './order-no-show.scheduler';
import { OrderCancellationsService } from './order-cancellations.service';
import { OrderCancellationResolutionService } from './order-cancellation-resolution.service';
import { OrderItemHandoverService } from './order-item-handover.service';
import { OrderItemReservationService } from './order-item-reservation.service';

@Module({
  imports: [SettingsModule, UnitsModule, StaffAuthModule, AuthzModule, RateLimitModule, OutboxModule, LogisticsModule, ReceiptsModule, PromotionsModule, CampaignsModule, ObservabilityModule],
  providers: [
    OrdersService,
    OrderCancellationsService,
    OrderCancellationResolutionService,
    OrderItemHandoverService,
    OrderItemReservationService,
    OrderNoShowScheduler,
  ],
  controllers: [OrdersController],
  exports: [OrdersService, OrderCancellationsService, OrderCancellationResolutionService, OrderItemHandoverService, OrderItemReservationService],
})
export class OrdersModule {}
