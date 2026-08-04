import { ServiceUnavailableException } from '@nestjs/common';
import {
  GatewayCreateIntentInput,
  GatewayRefundInput,
  GatewayRefundResult,
  GatewayRefundWebhookPayload,
  GatewayRefundWebhookRequest,
  GatewayWebhookPayload,
  GatewayWebhookRequest,
  PaymentGatewayProvider,
  PaymentIntentView,
} from './payment-gateway-provider';

/**
 * Онлайн-оплата не подключена — и это рабочее состояние, а не поломка.
 *
 * Отличие от `ProductionPaymentGatewayProvider` принципиально, и его должно быть
 * видно по коду ошибки: та заглушка означает «адаптер не доделан, ждём договор и
 * спецификацию провайдера», эта — «онлайн-платежей нет намеренно, магазин
 * продаёт за наличные при получении».
 *
 * Разница не косметическая. Пока единственным «неполным» состоянием была
 * production-заглушка, магазин мог работать только в песочнице, то есть в
 * демо-режиме, где заказ не бронирует слот доставки и не списывает промокод
 * (`orders.service.ts`). Продавать за наличные можно без всякого шлюза — этот
 * режим и открывает такую возможность.
 *
 * Тот же приём, что и `DisabledOtpSender` для входа по SMS: недоступной должна
 * быть ровно одна функция, а не весь сервис.
 */
export class NonePaymentGatewayProvider implements PaymentGatewayProvider {
  readonly name = 'none' as const;

  assertOperational(): void {
    this.unavailable();
  }

  createIntent(_input: GatewayCreateIntentInput): Promise<PaymentIntentView> {
    return this.unavailable();
  }

  verifyWebhook(_input: GatewayWebhookRequest): Promise<GatewayWebhookPayload> {
    return this.unavailable();
  }

  verifyRefundWebhook(_input: GatewayRefundWebhookRequest): Promise<GatewayRefundWebhookPayload> {
    return this.unavailable();
  }

  refund(_input: GatewayRefundInput): Promise<GatewayRefundResult> {
    return this.unavailable();
  }

  private unavailable(): never {
    throw new ServiceUnavailableException({
      code: 'online_payments_unavailable',
      message: 'Онлайн-оплата не подключена. Заказ оплачивается при получении.',
    });
  }
}
