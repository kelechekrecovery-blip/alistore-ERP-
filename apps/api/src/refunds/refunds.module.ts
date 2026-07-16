import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthzModule } from '../authz/authz.module';
import { PAYMENT_GATEWAY_PROVIDER, PaymentGatewayProvider } from '../payments/payment-gateway-provider';
import { selectPaymentGatewayProvider } from '../payments/payment-gateway-selector';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { RefundsController } from './refunds.controller';
import { RefundProcessor } from './refunds.processor';
import { RefundsService } from './refunds.service';
import { RefundRelay } from './refunds.relay';
import { RefundWebhooksController } from './refund-webhooks.controller';

@Module({
  imports: [StaffAuthModule, AuthzModule],
  providers: [
    RefundsService,
    RefundProcessor,
    RefundRelay,
    {
      provide: PAYMENT_GATEWAY_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentGatewayProvider =>
        selectPaymentGatewayProvider((name) => config.get<string>(name)),
    },
  ],
  controllers: [RefundsController, RefundWebhooksController],
  exports: [RefundsService, RefundProcessor],
})
export class RefundsModule {}
