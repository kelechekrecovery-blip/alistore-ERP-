import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { ConflictError, PaymentFailedError, ValidationError } from '../common/errors';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { CreatePaymentIntentDto, PaymentWebhookDto } from './payment-intents.dto';

export interface PaymentIntentView {
  intentId: string;
  provider: 'card' | 'mbank' | 'odengi' | 'installment';
  orderId: string;
  orderStatus: OrderStatus;
  method: PaymentMethod;
  amount: number;
  txnId: string;
  status: 'requires_action';
  expiresAt: string;
  paymentUrl: string;
  qrPayload: string | null;
}

const PROVIDER: Record<CreatePaymentIntentDto['method'], PaymentIntentView['provider']> = {
  card: 'card',
  qr_mbank: 'mbank',
  qr_odengi: 'odengi',
  installment: 'installment',
};

@Injectable()
export class PaymentIntentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
  ) {}

  async create(dto: CreatePaymentIntentDto): Promise<PaymentIntentView> {
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
    if (!order) {
      throw new ValidationError('order_not_found', `Заказ ${dto.orderId} не найден`);
    }
    if (order.total !== dto.amount) {
      throw new ValidationError('payment_amount_mismatch', `К оплате ${order.total}, передано ${dto.amount}`);
    }
    if (order.status === 'paid') {
      throw new ConflictError('order_already_paid', `Заказ ${order.id} уже оплачен`);
    }

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

    const provider = PROVIDER[dto.method];
    const issuedAt = Date.now();
    const txnId = `${provider}-${order.id}-${issuedAt}`;
    const intentId = `PI-${order.id.slice(-8).toUpperCase()}-${issuedAt.toString(36).toUpperCase()}`;
    const expiresAt = new Date(issuedAt + 15 * 60 * 1000).toISOString();
    return {
      intentId,
      provider,
      orderId: order.id,
      orderStatus: status,
      method: dto.method,
      amount: dto.amount,
      txnId,
      status: 'requires_action',
      expiresAt,
      paymentUrl: this.paymentUrl(provider, intentId, dto.returnUrl),
      qrPayload: this.qrPayload(provider, order.id, dto.amount, txnId),
    };
  }

  async webhook(dto: PaymentWebhookDto) {
    if (dto.status === 'failed') {
      throw new PaymentFailedError('payment_failed', `Провайдер отклонил платёж ${dto.txnId}`);
    }
    return this.payments.pay(
      { orderId: dto.orderId, method: dto.method, amount: dto.amount, txnId: dto.txnId },
      dto.actor ?? `provider:${PROVIDER[dto.method]}`,
    );
  }

  private paymentUrl(provider: PaymentIntentView['provider'], intentId: string, returnUrl?: string): string {
    const base = `/sandbox/payments/${provider}/${intentId}`;
    return returnUrl ? `${base}?returnUrl=${encodeURIComponent(returnUrl)}` : base;
  }

  private qrPayload(provider: PaymentIntentView['provider'], orderId: string, amount: number, txnId: string): string | null {
    if (provider !== 'mbank' && provider !== 'odengi') return null;
    return `alistore-${provider}://pay?order=${encodeURIComponent(orderId)}&amount=${amount}&txn=${encodeURIComponent(txnId)}`;
  }
}
