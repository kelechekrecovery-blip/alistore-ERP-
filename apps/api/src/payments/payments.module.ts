import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { UnitsModule } from '../units/units.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentIntentsService } from './payment-intents.service';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { GiftcardsModule } from '../giftcards/giftcards.module';

@Module({
  imports: [
    UnitsModule,
    ApprovalsModule,
    OrdersModule,
    StaffAuthModule,
    AuthzModule,
    RateLimitModule,
    GiftcardsModule,
  ],
  providers: [PaymentsService, PaymentIntentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
