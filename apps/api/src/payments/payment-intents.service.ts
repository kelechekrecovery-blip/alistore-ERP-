import { Inject, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
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

  async create(dto: CreatePaymentIntentDto, idempotencyKey?: string): Promise<PaymentIntentView> {
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

    if (order.isDemo) {
      return this.gateway.createIntent({
        idempotencyKey,
        orderId: order.id,
        orderStatus: order.status,
        method: dto.method,
        amount: dto.amount,
        returnUrl: dto.returnUrl,
      });
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

    return this.gateway.createIntent({
      idempotencyKey,
      orderId: order.id,
      orderStatus: status,
      method: dto.method,
      amount: dto.amount,
      returnUrl: dto.returnUrl,
    });
  }

  async createForCustomer(
    customerId: string,
    dto: CreatePaymentIntentDto,
    idempotencyKey?: string,
  ): Promise<PaymentIntentView> {
    const order = await this.prisma.order.findFirst({ where: { id: dto.orderId, customerId } });
    if (!order) {
      throw new ValidationError('order_not_found', `Заказ ${dto.orderId} не найден`);
    }
    if (!idempotencyKey?.trim()) return this.create({ ...dto, actor: customerId });

    const key = idempotencyKey.trim();
    if (key.length > 128) throw new ValidationError('invalid_idempotency_key', 'Idempotency key слишком длинный');
    const existing = await this.prisma.onlinePaymentIntentCommand.findUnique({ where: { idempotencyKey: key } });
    if (existing) return this.replay(existing, customerId, dto);

    try {
      await this.prisma.onlinePaymentIntentCommand.create({
        data: {
          idempotencyKey: key,
          customerId,
          orderId: dto.orderId,
          method: dto.method,
          amount: dto.amount,
          returnUrl: dto.returnUrl,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.prisma.onlinePaymentIntentCommand.findUniqueOrThrow({ where: { idempotencyKey: key } });
        return this.replay(raced, customerId, dto);
      }
      throw error;
    }

    try {
      const response = await this.create({ ...dto, actor: customerId }, key);
      await this.prisma.onlinePaymentIntentCommand.update({
        where: { idempotencyKey: key },
        data: { response: response as unknown as Prisma.InputJsonValue },
      });
      return response;
    } catch (error) {
      await this.prisma.onlinePaymentIntentCommand.deleteMany({ where: { idempotencyKey: key, response: { equals: Prisma.DbNull } } });
      throw error;
    }
  }

  private replay(
    command: { customerId: string; orderId: string; method: string; amount: number; returnUrl: string | null; response: Prisma.JsonValue | null },
    customerId: string,
    dto: CreatePaymentIntentDto,
  ): PaymentIntentView {
    const matches = command.customerId === customerId && command.orderId === dto.orderId &&
      command.method === dto.method && command.amount === dto.amount && command.returnUrl === (dto.returnUrl ?? null);
    if (!matches) throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим платежом');
    if (!command.response) throw new ConflictError('payment_intent_in_progress', 'Платёжный intent ещё создаётся');
    return command.response as unknown as PaymentIntentView;
  }

  async confirmSandboxIntent(intentId: string) {
    if (this.gateway.name !== 'sandbox') {
      throw new ValidationError('sandbox_payment_disabled', 'Sandbox payment отключён');
    }
    const command = await this.prisma.onlinePaymentIntentCommand.findFirst({
      where: { response: { path: ['intentId'], equals: intentId } },
    });
    if (!command?.response) throw new ValidationError('payment_intent_not_found', 'Платёжный intent не найден');
    const intent = command.response as unknown as PaymentIntentView;
    return this.webhook({
      orderId: intent.orderId,
      method: intent.method,
      amount: intent.amount,
      txnId: intent.txnId,
      status: 'succeeded',
      actor: 'sandbox',
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

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
