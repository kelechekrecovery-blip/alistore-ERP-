import { Module } from '@nestjs/common';
import { CourierService } from './courier.service';
import { CourierController } from './courier.controller';
import { DeliveriesController } from './deliveries.controller';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';
import { OutboxModule } from '../outbox/outbox.module';
import { UnitsModule } from '../units/units.module';

@Module({
  imports: [StaffAuthModule, AuthzModule, OutboxModule, UnitsModule],
  providers: [CourierService],
  controllers: [CourierController, DeliveriesController],
  exports: [CourierService],
})
export class CourierModule {}
