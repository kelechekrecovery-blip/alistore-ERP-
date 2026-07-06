import { Module } from '@nestjs/common';
import { CourierService } from './courier.service';
import { CourierController } from './courier.controller';
import { DeliveriesController } from './deliveries.controller';

@Module({
  providers: [CourierService],
  controllers: [CourierController, DeliveriesController],
  exports: [CourierService],
})
export class CourierModule {}
