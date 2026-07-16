import { Body, Controller, Headers, Inject, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  PAYMENT_GATEWAY_PROVIDER,
  PaymentGatewayProvider,
} from '../payments/payment-gateway-provider';
import { RefundProcessor } from './refunds.processor';

@ApiExcludeController()
@Controller('refunds/webhooks')
export class RefundWebhooksController {
  constructor(
    @Inject(PAYMENT_GATEWAY_PROVIDER) private readonly gateway: PaymentGatewayProvider,
    private readonly processor: RefundProcessor,
  ) {}

  @Post('provider')
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    const payload = await this.gateway.verifyRefundWebhook({
      payload: body,
      rawBody: request.rawBody,
      headers,
    });
    await this.processor.reconcileProviderRefund(payload, 'system:refund-provider-webhook');
    return { accepted: true };
  }
}
