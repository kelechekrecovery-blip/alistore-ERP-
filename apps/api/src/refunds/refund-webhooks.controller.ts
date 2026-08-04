import { Body, Controller, Headers, Inject, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
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

  // Публичный маршрут без аутентификации: его защита — проверка подписи внутри
  // gateway.verifyRefundWebhook. В проде провайдер — `none`, и он отдаёт 503
  // (возвраты идут наличными через домен refunds), то есть вебхук недостижим.
  // На sandbox/staging подпись не проверяется — там лимит закрывает перебор
  // статусов, пока боевой адаптер с подписью не появится.
  @Post('provider')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
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
