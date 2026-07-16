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
import { ConfigService } from '@nestjs/config';
import { PAYMENT_GATEWAY_PROVIDER, PaymentGatewayProvider } from './payment-gateway-provider';
import { selectPaymentGatewayProvider } from './payment-gateway-selector';
import { SandboxPaymentsController } from './sandbox-payments.controller';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { RefundsModule } from '../refunds/refunds.module';

@Module({
  imports: [
    UnitsModule,
    ApprovalsModule,
    OrdersModule,
    StaffAuthModule,
    AuthzModule,
    RateLimitModule,
    GiftcardsModule,
    CampaignsModule,
    RefundsModule,
  ],
  providers: [
    PaymentsService,
    PaymentIntentsService,
    {
      provide: PAYMENT_GATEWAY_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentGatewayProvider =>
        selectPaymentGatewayProvider((name) => config.get<string>(name)),
    },
  ],
  controllers: [PaymentsController, SandboxPaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
