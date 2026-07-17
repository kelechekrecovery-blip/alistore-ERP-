import { Inject, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { ConflictError, PaymentFailedError, ValidationError } from '../common/errors';
import { EventType } from '../audit/event-types';
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
    const replay = await this.prisma.onlinePaymentIntentCommand.findFirst({
      where: { orderId: order.id, method: dto.method, amount: dto.amount, response: { not: Prisma.DbNull } },
      orderBy: { createdAt: 'desc' },
    });
    if (replay?.response) return replay.response as unknown as PaymentIntentView;
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

    const intent = await this.gateway.createIntent({
      idempotencyKey,
      orderId: order.id,
      orderStatus: status,
      method: dto.method,
      amount: dto.amount,
      returnUrl: dto.returnUrl,
    });
    if (!idempotencyKey) {
      const autoKey = `payment-intent:${order.id}:${dto.method}:${dto.amount}`;
      await this.prisma.onlinePaymentIntentCommand.upsert({
        where: { idempotencyKey: autoKey },
        create: {
          idempotencyKey: autoKey,
          customerId: dto.actor ?? 'system:payment-intent',
          orderId: order.id,
          method: dto.method,
          amount: dto.amount,
          returnUrl: dto.returnUrl,
          response: intent as unknown as Prisma.InputJsonValue,
        },
        update: { response: intent as unknown as Prisma.InputJsonValue },
      });
    }
    return intent;
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

  async webhook(dto: PaymentWebhookDto, request?: Omit<GatewayWebhookRequest, 'payload'>): Promise<PaymentWebhookResult> {
    const verified = await this.gateway.verifyWebhook({
      payload: dto,
      rawBody: request?.rawBody,
      headers: request?.headers ?? {},
    });
    if (verified.status === 'failed') {
      throw new PaymentFailedError('payment_failed', `Провайдер отклонил платёж ${verified.txnId}`);
    }
    const order = await this.prisma.order.findUnique({ where: { id: verified.orderId } });
    if (!order) throw new ValidationError('order_not_found', `Заказ ${verified.orderId} не найден`);
    // Money for an order that can no longer take it (cancelled, or swept back to an
    // unreserved state) is parked with a refund path instead of looping a bare 409.
    // Demo orders never create payments — they keep hitting the pay() guard below.
    if (!order.isDemo && !['reserved', 'awaiting_payment'].includes(order.status)) {
      return this.parkCancelledOrderPayment(order.id, verified, verified.actor ?? `provider:${verified.method}`);
    }
    try {
      return await this.payments.pay(
        { orderId: verified.orderId, method: verified.method, amount: verified.amount, txnId: verified.txnId },
        verified.actor ?? `provider:${verified.method}`,
      );
    } catch (error) {
      // The order left a payable state between the pre-check and the locked pay()
      // (cancel or reservation sweep) — park the money instead of a bare 409.
      if (!order.isDemo && error instanceof ConflictError && error.code === 'payment_without_reservation') {
        return this.parkCancelledOrderPayment(order.id, verified, verified.actor ?? `provider:${verified.method}`);
      }
      throw error;
    }
  }

  private async parkCancelledOrderPayment(
    orderId: string,
    payload: { method: PaymentWebhookDto['method']; amount: number; txnId: string },
    actor: string,
  ): Promise<PaymentWebhookResult> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({ where: { txnId: payload.txnId } });
      if (existing) {
        if (existing.orderId !== orderId || existing.amount !== payload.amount || existing.method !== payload.method) {
          throw new ConflictError('payment_txn_reused', 'Provider txnId уже использован для другого платежа');
        }
        const existingOrder = await tx.order.findUnique({ where: { id: orderId } });
        return { order: existingOrder, payment: existing, parked: true, idempotent: true };
      }
      const payment = await tx.payment.create({
        data: {
          orderId,
          amount: payload.amount,
          method: payload.method,
          status: 'pending',
          txnId: payload.txnId,
          receivedBy: actor,
        },
      });
      const parkedOrder = await tx.order.findUnique({ where: { id: orderId } });
      await tx.auditEvent.create({
        data: {
          type: EventType.PaymentParked,
          actor,
          payload: { orderId, paymentId: payment.id, amount: payload.amount, method: payload.method, txnId: payload.txnId, reason: 'order_cancelled' },
          refs: [orderId, payment.id],
        },
      });
      return { order: parkedOrder, payment, parked: true, idempotent: false };
    });
  }
}

type PaymentWebhookResult = Awaited<ReturnType<PaymentsService['pay']>> & { parked?: boolean };

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
