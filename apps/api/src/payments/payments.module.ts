import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { UnitsModule } from '../units/units.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentIntentsService } from './payment-intents.service';

@Module({
  imports: [UnitsModule, ApprovalsModule, OrdersModule],
  providers: [PaymentsService, PaymentIntentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
