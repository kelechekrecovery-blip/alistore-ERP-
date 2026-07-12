import { Inject, Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { ConflictError, PaymentFailedError, ValidationError } from '../common/errors';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { CreatePaymentIntentDto, PaymentWebhookDto } from './payment-intents.dto';
import {
  GatewayWebhookRequest,
  PAYMENT_GATEWAY_PROVIDER,
  PaymentGatewayProvider,
  PaymentIntentView,
} from './payment-gateway-provider';

export type { PaymentIntentView } from './payment-gateway-provider';

@Injectable()
export class PaymentIntentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    @Inject(PAYMENT_GATEWAY_PROVIDER) private readonly gateway: PaymentGatewayProvider,
  ) {}

  async create(dto: CreatePaymentIntentDto): Promise<PaymentIntentView> {
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
    if (!order) {
      throw new ValidationError('order_not_found', `Заказ ${dto.orderId} не найден`);
    }
    if (order.status === 'paid') {
      throw new ConflictError('order_already_paid', `Заказ ${order.id} уже оплачен`);
    }
    const received = await this.prisma.payment.aggregate({
      where: { orderId: order.id, amount: { gt: 0 } },
      _sum: { amount: true },
    });
    const due = order.total - (received._sum.amount ?? 0);
    if (due !== dto.amount) {
      throw new ValidationError('payment_amount_mismatch', `К оплате ${due}, передано ${dto.amount}`);
    }
    this.gateway.assertOperational();

    let status: OrderStatus = order.status;
    if (status === 'created' || status === 'confirmed') {
      const fulfilled = await this.orders.fulfill(order.id, dto.actor ?? 'web_checkout');
      status = fulfilled.order?.status ?? 'reserved';
    }
    if (status === 'reserved') {
      status = (await this.orders.transition(order.id, 'awaiting_payment', dto.actor ?? 'web_checkout')).status;
    }
    if (status !== 'awaiting_payment') {
      throw new ConflictError('order_not_payable', `Заказ ${order.id} нельзя оплатить в статусе ${status}`);
    }

    return this.gateway.createIntent({
      orderId: order.id,
      orderStatus: status,
      method: dto.method,
      amount: dto.amount,
      returnUrl: dto.returnUrl,
    });
  }

  async webhook(dto: PaymentWebhookDto, request?: Omit<GatewayWebhookRequest, 'payload'>) {
    const verified = await this.gateway.verifyWebhook({
      payload: dto,
      rawBody: request?.rawBody,
      headers: request?.headers ?? {},
    });
    if (verified.status === 'failed') {
      throw new PaymentFailedError('payment_failed', `Провайдер отклонил платёж ${verified.txnId}`);
    }
    return this.payments.pay(
      { orderId: verified.orderId, method: verified.method, amount: verified.amount, txnId: verified.txnId },
      verified.actor ?? `provider:${verified.method}`,
    );
  }
}
