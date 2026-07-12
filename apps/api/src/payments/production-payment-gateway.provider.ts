import { ServiceUnavailableException } from '@nestjs/common';
import {
  GatewayCreateIntentInput,
  GatewayRefundInput,
  GatewayRefundResult,
  GatewayWebhookPayload,
  GatewayWebhookRequest,
  PaymentGatewayProvider,
  PaymentIntentView,
} from './payment-gateway-provider';

export interface ProductionPaymentGatewayOptions {
  apiUrl: string;
  merchantId: string;
  apiKey: string;
  webhookSecret: string;
}

/** Activated only by a complete env set; real HTTP/signature logic arrives with the provider contract. */
export class ProductionPaymentGatewayProvider implements PaymentGatewayProvider {
  readonly name = 'production' as const;

  constructor(private readonly options: ProductionPaymentGatewayOptions) {}

  assertOperational(): void {
    this.unavailable();
  }

  createIntent(_input: GatewayCreateIntentInput): Promise<PaymentIntentView> {
    return this.unavailable();
  }

  verifyWebhook(_input: GatewayWebhookRequest): Promise<GatewayWebhookPayload> {
    return this.unavailable();
  }

  refund(_input: GatewayRefundInput): Promise<GatewayRefundResult> {
    return this.unavailable();
  }

  isConfigured(): boolean {
    return Object.values(this.options).every((value) => value.length > 0);
  }

  private unavailable(): never {
    throw new ServiceUnavailableException({
      code: 'production_payment_gateway_not_activated',
      message: 'Боевой платёжный адаптер ждёт договор и спецификацию провайдера',
    });
  }
}
