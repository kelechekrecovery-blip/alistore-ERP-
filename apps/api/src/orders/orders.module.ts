import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { UnitsModule } from '../units/units.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { LogisticsModule } from '../logistics/logistics.module';

@Module({
  imports: [UnitsModule, StaffAuthModule, AuthzModule, RateLimitModule, OutboxModule, LogisticsModule],
  providers: [OrdersService],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
