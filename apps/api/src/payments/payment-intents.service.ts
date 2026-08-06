import { Inject, Injectable } from '@nestjs/common';
import { OnlinePaymentIntentCommand, OrderStatus, Prisma, type Order, type Payment } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { ConflictError, PaymentFailedError, ValidationError } from '../common/errors';
import { EventType } from '../audit/event-types';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { CreatePaymentIntentDto, PaymentWebhookDto } from './payment-intents.dto';
import {
  GatewayWebhookRequest,
  GatewayWebhookPayload,
  PAYMENT_GATEWAY_PROVIDER,
  PaymentGatewayProvider,
  PaymentIntentView,
} from './payment-gateway-provider';
import {
  CustomerSessionRevokedException,
  isActiveCustomerPhone,
  lockActiveCustomerOnTx,
} from '../auth/customer-session-state';

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
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { customerId: true },
    });
    if (!order) throw new ValidationError('order_not_found', `Заказ ${dto.orderId} не найден`);
    const internalKey = idempotencyKey?.trim() || `internal:${paymentIntentRequestHash(order.customerId, dto)}`;
    return this.createDurable(order.customerId, dto, internalKey);
  }

  async createForCustomer(
    customerId: string,
    dto: CreatePaymentIntentDto,
    idempotencyKey?: string,
  ): Promise<PaymentIntentView> {
    const key = idempotencyKey?.trim();
    if (!key) throw new ValidationError('idempotency_key_required', 'Требуется Idempotency-Key');
    if (key.length > 128) throw new ValidationError('invalid_idempotency_key', 'Idempotency-Key слишком длинный');
    return this.createDurable(customerId, { ...dto, actor: customerId }, key);
  }

  private async createDurable(
    customerId: string,
    dto: CreatePaymentIntentDto,
    rawKey: string,
  ): Promise<PaymentIntentView> {
    assertSafeReturnUrl(dto.returnUrl);
    this.gateway.assertOperational();
    const requestHash = paymentIntentRequestHash(customerId, dto);
    const storedKey = localPaymentIntentKey(customerId, rawKey);
    const command = await this.prepareCommand(customerId, dto, rawKey, storedKey, requestHash);

    const claimToken = randomUUID();
    const claimed = await this.claimCommand(command.id, customerId, requestHash, claimToken);
    if (claimed.response) return claimed.response;

    let dispatched = false;
    let providerIntent: PaymentIntentView | undefined;
    try {
      let status: OrderStatus = claimed.orderStatus;
      if (!claimed.isDemo && (status === 'created' || status === 'confirmed')) {
        const fulfilled = await this.orders.fulfill(dto.orderId, dto.actor ?? customerId, customerId);
        status = fulfilled.order?.status ?? 'reserved';
      }
      if (!claimed.isDemo && status === 'reserved') {
        status = (await this.orders.transition(dto.orderId, 'awaiting_payment', dto.actor ?? customerId, customerId)).status;
      }
      if (!claimed.isDemo && status !== 'awaiting_payment') {
        throw new ConflictError('order_not_payable', `Заказ ${dto.orderId} нельзя оплатить в статусе ${status}`);
      }

      await this.markDispatchStarted(command.id, customerId, claimToken);
      dispatched = true;
      const intent = await this.gateway.createIntent({
        idempotencyKey: command.providerIdempotencyKey,
        orderId: dto.orderId,
        orderStatus: status,
        method: dto.method,
        amount: dto.amount,
        returnUrl: dto.returnUrl,
      });
      providerIntent = intent;
      assertProviderIntent(intent, dto, status, this.gateway.name);
      return await this.finalizeProviderIntent(command.id, customerId, claimToken, intent);
    } catch (error) {
      await this.recordCreationFailure(
        command.id,
        customerId,
        claimToken,
        dispatched,
        error,
        providerIntent,
      ).catch(() => undefined);
      if (dispatched) {
        throw new ConflictError(
          'payment_intent_creation_unknown',
          'Результат создания платежа уточняется; повторная отправка заблокирована',
        );
      }
      throw error;
    }
  }

  private prepareCommand(
    customerId: string,
    dto: CreatePaymentIntentDto,
    rawKey: string,
    storedKey: string,
    requestHash: string,
  ): Promise<OnlinePaymentIntentCommand> {
    return this.prisma.$transaction(async (tx) => {
      await lockActiveCustomerOnTx(tx, customerId);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'payment-intent:' + storedKey}))::text AS locked`;
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${dto.orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: dto.orderId } });
      if (!order || order.customerId !== customerId) {
        throw new ValidationError('order_not_found', `Заказ ${dto.orderId} не найден`);
      }
      const existing = await tx.onlinePaymentIntentCommand.findFirst({
        where: {
          customerId,
          OR: [
            { idempotencyKey: storedKey },
            {
              idempotencyKey: rawKey,
              gatewayMode: { in: ['legacy', 'legacy-unknown'] },
            },
          ],
        },
      });
      if (existing) return existing;
      const legacyTuple = await tx.onlinePaymentIntentCommand.findFirst({
        where: {
          orderId: dto.orderId,
          method: dto.method,
          amount: dto.amount,
          gatewayMode: { in: ['legacy', 'legacy-unknown'] },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (legacyTuple) return legacyTuple;
      if (order.status === 'paid') {
        throw new ConflictError('order_already_paid', `Заказ ${order.id} уже оплачен`);
      }
      const received = await tx.payment.aggregate({
        where: {
          orderId: order.id,
          amount: { gt: 0 },
          status: { in: ['received', 'reconciled'] },
        },
        _sum: { amount: true },
      });
      const due = order.total - (received._sum.amount ?? 0);
      if (due !== dto.amount) {
        throw new ValidationError('payment_amount_mismatch', `К оплате ${due}, передано ${dto.amount}`);
      }
      const id = randomUUID();
      return tx.onlinePaymentIntentCommand.create({
        data: {
          id,
          idempotencyKey: storedKey,
          providerIdempotencyKey: providerPaymentIntentKey(id),
          requestHash,
          customerId,
          orderId: dto.orderId,
          method: dto.method,
          amount: dto.amount,
          returnUrl: dto.returnUrl,
          gatewayMode: this.gateway.name,
        },
      });
    });
  }

  private async claimCommand(
    commandId: string,
    customerId: string,
    requestHash: string,
    claimToken: string,
  ): Promise<{ orderStatus: OrderStatus; isDemo: boolean; response?: PaymentIntentView }> {
    const outcome = await this.prisma.$transaction(async (tx): Promise<ClaimCommandOutcome> => {
      await lockActiveCustomerOnTx(tx, customerId);
      const commandSnapshot = await tx.onlinePaymentIntentCommand.findUniqueOrThrow({ where: { id: commandId } });
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${commandSnapshot.orderId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "OnlinePaymentIntentCommand" WHERE id = ${commandId} FOR UPDATE`;
      const [order, command] = await Promise.all([
        tx.order.findUnique({ where: { id: commandSnapshot.orderId } }),
        tx.onlinePaymentIntentCommand.findUniqueOrThrow({ where: { id: commandId } }),
      ]);
      const legacyOwner = command.gatewayMode === 'legacy' || command.gatewayMode === 'legacy-unknown';
      if (!order || order.customerId !== customerId || (!legacyOwner && command.customerId !== customerId)) {
        throw new ValidationError('order_not_found', `Заказ ${commandSnapshot.orderId} не найден`);
      }
      if (command.status === 'requires_action') {
        const existingPayment = command.providerTxnId
          ? await tx.payment.findUnique({ where: { txnId: command.providerTxnId } })
          : null;
        const matchesSettledPayment = Boolean(
          existingPayment
          && ['received', 'reconciled'].includes(existingPayment.status)
          && existingPayment.orderId === command.orderId
          && existingPayment.method === command.method
          && existingPayment.amount === command.amount,
        );
        if (matchesSettledPayment) {
          await tx.onlinePaymentIntentCommand.update({
            where: { id: command.id },
            data: { status: 'paid', response: Prisma.DbNull, terminalAt: new Date() },
          });
          return { error: new ConflictError('payment_intent_already_paid', 'Заказ уже оплачен') };
        }
        if (order.status === 'paid' || existingPayment) {
          await tx.onlinePaymentIntentCommand.update({
            where: { id: command.id },
            data: {
              status: 'manual_review',
              response: Prisma.DbNull,
              lastErrorCode: 'payment_intent_settlement_mismatch',
              lastErrorAt: new Date(),
            },
          });
          return { error: lifecycleConflict('manual_review') };
        }
        if (command.expiresAt && command.expiresAt.getTime() <= Date.now()) {
          await tx.onlinePaymentIntentCommand.update({
            where: { id: command.id },
            data: { status: 'expired', response: Prisma.DbNull, terminalAt: new Date() },
          });
          return { error: lifecycleConflict('expired') };
        }
        if (!['created', 'confirmed', 'reserved', 'awaiting_payment'].includes(order.status)) {
          await tx.onlinePaymentIntentCommand.update({
            where: { id: command.id },
            data: {
              status: 'manual_review',
              response: Prisma.DbNull,
              lastErrorCode: 'order_no_longer_payable',
              lastErrorAt: new Date(),
            },
          });
          return { error: lifecycleConflict('manual_review') };
        }
      }
      const replay = replayPaymentIntent(command, requestHash);
      if (replay) return { orderStatus: order.status, isDemo: order.isDemo, response: replay };
      if (command.status === 'creating') {
        if (command.leaseUntil && command.leaseUntil.getTime() <= Date.now()) {
          await tx.onlinePaymentIntentCommand.update({
            where: { id: command.id },
            data: {
              status: 'creation_unknown',
              lastErrorCode: 'dispatch_lease_expired',
              lastErrorAt: new Date(),
            },
          });
          return {
            error: new ConflictError(
              'payment_intent_creation_unknown',
              'Результат создания платежа уточняется; повторная отправка заблокирована',
            ),
          };
        }
        throw new ConflictError('payment_intent_in_progress', 'Платёжный intent ещё создаётся');
      }
      if (command.status !== 'queued') throw lifecycleConflict(command.status);
      await tx.onlinePaymentIntentCommand.update({
        where: { id: command.id },
        data: {
          status: 'creating',
          claimToken,
          leaseUntil: new Date(Date.now() + 2 * 60_000),
        },
      });
      return { orderStatus: order.status, isDemo: order.isDemo };
    });
    if ('error' in outcome) throw outcome.error;
    return outcome;
  }

  private markDispatchStarted(commandId: string, customerId: string, claimToken: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      await lockActiveCustomerOnTx(tx, customerId);
      const snapshot = await tx.onlinePaymentIntentCommand.findUniqueOrThrow({ where: { id: commandId } });
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${snapshot.orderId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "OnlinePaymentIntentCommand" WHERE id = ${commandId} FOR UPDATE`;
      const command = await tx.onlinePaymentIntentCommand.findUniqueOrThrow({ where: { id: commandId } });
      if (!['creating', 'creation_unknown', 'cancel_pending'].includes(command.status) || command.claimToken !== claimToken) {
        throw lifecycleConflict(command.status);
      }
      await tx.onlinePaymentIntentCommand.update({
        where: { id: command.id },
        data: { attempts: { increment: 1 }, dispatchedAt: new Date() },
      });
    });
  }

  private async finalizeProviderIntent(
    commandId: string,
    customerId: string,
    claimToken: string,
    intent: PaymentIntentView,
  ): Promise<PaymentIntentView> {
    const active = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      const snapshot = await tx.onlinePaymentIntentCommand.findUniqueOrThrow({ where: { id: commandId } });
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${snapshot.orderId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "OnlinePaymentIntentCommand" WHERE id = ${commandId} FOR UPDATE`;
      const command = await tx.onlinePaymentIntentCommand.findUniqueOrThrow({ where: { id: commandId } });
      if (!['creating', 'creation_unknown', 'cancel_pending'].includes(command.status)
        || command.claimToken !== claimToken) {
        throw lifecycleConflict(command.status);
      }
      const customerIsActive = Boolean(customer && isActiveCustomerPhone(customer.phone));
      const evidence = paymentIntentEvidence(intent);
      await tx.onlinePaymentIntentCommand.update({
        where: { id: command.id },
        data: {
          status: customerIsActive ? 'requires_action' : 'cancel_pending',
          providerName: intent.provider,
          providerIntentId: intent.intentId,
          providerTxnId: intent.txnId,
          providerResult: evidence as Prisma.InputJsonValue,
          providerResultHash: paymentIntentResultHash(intent),
          providerResultAt: new Date(),
          response: customerIsActive
            ? intent as unknown as Prisma.InputJsonValue
            : Prisma.DbNull,
          expiresAt: new Date(intent.expiresAt),
          claimToken: null,
          leaseUntil: null,
          customerRevokedAt: customerIsActive
            ? command.customerRevokedAt
            : (command.customerRevokedAt ?? new Date()),
        },
      });
      return customerIsActive;
    });
    if (!active) throw new CustomerSessionRevokedException();
    return intent;
  }

  private recordCreationFailure(
    commandId: string,
    customerId: string,
    claimToken: string,
    dispatched: boolean,
    error: unknown,
    providerIntent?: PaymentIntentView,
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      const snapshot = await tx.onlinePaymentIntentCommand.findUnique({ where: { id: commandId } });
      if (!snapshot) return;
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${snapshot.orderId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "OnlinePaymentIntentCommand" WHERE id = ${commandId} FOR UPDATE`;
      const command = await tx.onlinePaymentIntentCommand.findUnique({ where: { id: commandId } });
      if (
        !command
        || !['creating', 'creation_unknown', 'cancel_pending'].includes(command.status)
        || command.claimToken !== claimToken
      ) return;
      const active = Boolean(customer && isActiveCustomerPhone(customer.phone));
      const status = active
        ? (dispatched ? 'creation_unknown' : 'creation_failed')
        : (dispatched ? 'cancel_pending' : 'cancelled');
      const evidence = providerIntent ? paymentIntentEvidence(providerIntent) : undefined;
      const parsedExpiry = providerIntent ? Date.parse(providerIntent.expiresAt) : Number.NaN;
      await tx.onlinePaymentIntentCommand.update({
        where: { id: command.id },
        data: {
          status,
          claimToken: null,
          leaseUntil: null,
          lastErrorCode: safeErrorCode(error),
          lastErrorAt: new Date(),
          customerRevokedAt: active
            ? command.customerRevokedAt
            : (command.customerRevokedAt ?? new Date()),
          terminalAt: status === 'creation_failed' || status === 'cancelled' ? new Date() : null,
          ...(providerIntent
            ? {
                providerName: providerIntent.provider || null,
                providerIntentId: providerIntent.intentId || null,
                providerTxnId: providerIntent.txnId || null,
                providerResult: evidence as Prisma.InputJsonValue,
                providerResultHash: paymentIntentResultHash(providerIntent),
                providerResultAt: new Date(),
                expiresAt: Number.isFinite(parsedExpiry) ? new Date(parsedExpiry) : null,
              }
            : {}),
        },
      });
    });
  }

  async confirmSandboxIntent(intentId: string, expectedProvider?: string) {
    if (this.gateway.name !== 'sandbox') {
      throw new ValidationError('sandbox_payment_disabled', 'Sandbox payment отключён');
    }
    const command = await this.prisma.onlinePaymentIntentCommand.findFirst({
      where: { response: { path: ['intentId'], equals: intentId } },
    });
    if (!command?.response) throw new ValidationError('payment_intent_not_found', 'Платёжный intent не найден');
    const actionable = await this.loadActionableSandboxCommand(command.id, command.orderId);
    const intent = parseStoredPaymentIntent(actionable);
    if (expectedProvider && intent.provider !== expectedProvider) {
      throw new ValidationError('payment_intent_provider_mismatch', 'Провайдер платежа не совпадает с intent');
    }
    return this.applyWebhookPayload({
      provider: intent.provider,
      orderId: intent.orderId,
      method: intent.method,
      amount: intent.amount,
      txnId: intent.txnId,
      status: 'succeeded',
      actor: 'sandbox',
    });
  }

  private async loadActionableSandboxCommand(
    commandId: string,
    orderId: string,
  ): Promise<OnlinePaymentIntentCommand> {
    const outcome = await this.prisma.$transaction(async (tx): Promise<
      { command: OnlinePaymentIntentCommand } | { error: ConflictError }
    > => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "OnlinePaymentIntentCommand" WHERE id = ${commandId} FOR UPDATE`;
      const command = await tx.onlinePaymentIntentCommand.findUnique({ where: { id: commandId } });
      if (!command?.response) {
        return { error: new ConflictError('payment_intent_not_actionable', 'Платёжный intent недоступен') };
      }
      if (command.expiresAt && command.expiresAt.getTime() <= Date.now()) {
        await tx.onlinePaymentIntentCommand.update({
          where: { id: command.id },
          data: { status: 'expired', response: Prisma.DbNull, terminalAt: new Date() },
        });
        return { error: lifecycleConflict('expired') };
      }
      return { command };
    });
    if ('error' in outcome) throw outcome.error;
    return outcome.command;
  }

  async webhook(dto: PaymentWebhookDto, request?: Omit<GatewayWebhookRequest, 'payload'>): Promise<PaymentWebhookResult> {
    const verified = await this.gateway.verifyWebhook({
      payload: dto,
      rawBody: request?.rawBody,
      headers: request?.headers ?? {},
    });
    return this.applyWebhookPayload(verified);
  }

  /**
   * Apply a payload that has already crossed its trust boundary.
   * Provider webhooks must go through verifyWebhook above; the sandbox UI
   * confirmation is a separate, guarded local action and therefore does not
   * pretend to be a provider callback.
   */
  private async applyWebhookPayload(verified: GatewayWebhookPayload): Promise<PaymentWebhookResult> {
    const correlated = await this.correlateWebhook(verified);
    const providerActor = `provider:${correlated.command.providerName}`;
    if (verified.status === 'failed') {
      throw new PaymentFailedError('payment_failed', `Провайдер отклонил платёж ${verified.txnId}`);
    }
    if (correlated.existingPayment) {
      await this.finalizeWebhookCommands(correlated.commandIds, correlated.order.id, verified.txnId);
      const parked = correlated.existingPayment.status === 'pending';
      return {
        order: correlated.order,
        payment: correlated.existingPayment,
        idempotent: true,
        ...(parked ? { parked: true } : {}),
      };
    }
    // Money for an order that can no longer take it (cancelled, or swept back to an
    // unreserved state) is parked with a refund path instead of looping a bare 409.
    // Demo orders never create payments — they keep hitting the pay() guard below.
    if (!correlated.order.isDemo && !['reserved', 'awaiting_payment'].includes(correlated.order.status)) {
      const parked = await this.parkCancelledOrderPayment(correlated.order.id, verified, providerActor);
      await this.finalizeWebhookCommands(correlated.commandIds, correlated.order.id, verified.txnId);
      return parked;
    }
    try {
      const paid = await this.payments.pay(
        { orderId: verified.orderId, method: verified.method, amount: verified.amount, txnId: verified.txnId },
        providerActor,
      );
      await this.finalizeWebhookCommands(correlated.commandIds, correlated.order.id, verified.txnId);
      return paid;
    } catch (error) {
      // The order left a payable state between the pre-check and the locked pay()
      // (cancel or reservation sweep) — park the money instead of a bare 409.
      if (!correlated.order.isDemo && error instanceof ConflictError && error.code === 'payment_without_reservation') {
        const parked = await this.parkCancelledOrderPayment(correlated.order.id, verified, providerActor);
        await this.finalizeWebhookCommands(correlated.commandIds, correlated.order.id, verified.txnId);
        return parked;
      }
      throw error;
    }
  }

  private async correlateWebhook(verified: GatewayWebhookPayload): Promise<CorrelatedWebhook> {
    const candidates = await this.prisma.onlinePaymentIntentCommand.findMany({
      where: {
        providerTxnId: verified.txnId,
        providerName: verified.provider,
        gatewayMode: { in: [this.gateway.name, 'legacy'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (candidates.length === 0) {
      throw new ValidationError(
        'payment_webhook_not_correlated',
        'Платёжный callback не связан с выданным intent',
      );
    }
    const matching = candidates.filter((command) => (
      command.orderId === verified.orderId
      && command.method === verified.method
      && command.amount === verified.amount
      && command.providerName
      && command.providerIntentId
    ));
    if (matching.length === 0) {
      throw new ConflictError(
        'payment_webhook_mismatch',
        'Платёжный callback не совпадает с выданным intent',
      );
    }
    const commandIds = matching.map((command) => command.id);
    return this.prisma.$transaction(async (tx) => {
      const command = matching[0]!;
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${command.orderId} FOR UPDATE`;
      for (const id of [...commandIds].sort()) {
        await tx.$queryRaw`SELECT id FROM "OnlinePaymentIntentCommand" WHERE id = ${id} FOR UPDATE`;
      }
      const [order, lockedCommands, existingPayment] = await Promise.all([
        tx.order.findUnique({ where: { id: command.orderId } }),
        tx.onlinePaymentIntentCommand.findMany({ where: { id: { in: commandIds } }, orderBy: { createdAt: 'asc' } }),
        tx.payment.findUnique({ where: { txnId: verified.txnId } }),
      ]);
      if (!order || lockedCommands.length !== commandIds.length) {
        throw new ValidationError('order_not_found', `Заказ ${verified.orderId} не найден`);
      }
      if (existingPayment && (
        existingPayment.orderId !== order.id
        || existingPayment.method !== verified.method
        || existingPayment.amount !== verified.amount
      )) {
        throw new ConflictError('payment_txn_reused', 'Provider txnId уже использован для другого платежа');
      }
      if (verified.status === 'failed') {
        const contradictory = Boolean(existingPayment)
          || lockedCommands.some((item) => item.status === 'paid' || item.status === 'manual_review');
        await tx.onlinePaymentIntentCommand.updateMany({
          where: { id: { in: commandIds } },
          data: {
            status: contradictory ? 'manual_review' : 'payment_failed',
            response: Prisma.DbNull,
            lastErrorCode: contradictory ? 'provider_failed_after_money' : 'provider_payment_failed',
            lastErrorAt: new Date(),
            terminalAt: contradictory ? null : new Date(),
          },
        });
      }
      return {
        command: lockedCommands[0]!,
        commandIds,
        order,
        existingPayment,
      };
    });
  }

  private finalizeWebhookCommands(commandIds: string[], orderId: string, txnId: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      for (const id of [...commandIds].sort()) {
        await tx.$queryRaw`SELECT id FROM "OnlinePaymentIntentCommand" WHERE id = ${id} FOR UPDATE`;
      }
      const [commands, payment] = await Promise.all([
        tx.onlinePaymentIntentCommand.findMany({ where: { id: { in: commandIds } } }),
        tx.payment.findUnique({ where: { txnId } }),
      ]);
      if (!payment) throw new ConflictError('payment_not_recorded', 'Платёж не записан');
      const parked = payment.status === 'pending';
      const contradictory = commands.some((command) => (
        command.gatewayMode === 'legacy'
        || command.status === 'payment_failed'
        || command.status === 'manual_review'
      ));
      const manualReview = parked || contradictory;
      await tx.onlinePaymentIntentCommand.updateMany({
        where: { id: { in: commandIds } },
        data: manualReview
          ? {
              status: 'manual_review',
              response: Prisma.DbNull,
              lastErrorCode: parked ? 'payment_parked' : 'provider_event_conflict',
              lastErrorAt: new Date(),
              terminalAt: null,
            }
          : { status: 'paid', response: Prisma.DbNull, terminalAt: new Date() },
      });
    });
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
        const parked = existing.status === 'pending';
        return { order: existingOrder, payment: existing, parked, idempotent: true };
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

interface CorrelatedWebhook {
  command: OnlinePaymentIntentCommand;
  commandIds: string[];
  order: Order;
  existingPayment: Payment | null;
}

type ClaimCommandOutcome =
  | { orderStatus: OrderStatus; isDemo: boolean; response?: PaymentIntentView }
  | { error: ConflictError };

function paymentIntentRequestHash(customerId: string, dto: CreatePaymentIntentDto): string {
  return createHash('sha256')
    .update(stableJson({
      customerId,
      orderId: dto.orderId,
      method: dto.method,
      amount: dto.amount,
      returnUrl: dto.returnUrl ?? null,
    }))
    .digest('hex');
}

function localPaymentIntentKey(customerId: string, rawKey: string): string {
  return `client:v1:${createHash('sha256').update(`${customerId}\0${rawKey}`).digest('hex')}`;
}

function providerPaymentIntentKey(commandId: string): string {
  return `provider:v1:${createHash('sha256').update(commandId).digest('hex')}`;
}

function replayPaymentIntent(
  command: OnlinePaymentIntentCommand,
  requestHash: string,
): PaymentIntentView | null {
  if (
    (command.gatewayMode === 'legacy' || command.gatewayMode === 'legacy-unknown')
    && command.requestHash.startsWith('legacy-columns-v1:')
  ) {
    throw lifecycleConflict(command.status);
  }
  if (command.requestHash !== requestHash) {
    throw new ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован с другим платежом');
  }
  if (command.status === 'queued' || command.status === 'creating') return null;
  if (command.status === 'paid') {
    throw new ConflictError('payment_intent_already_paid', 'Заказ уже оплачен');
  }
  if (command.status === 'requires_action' && command.response) {
    const response = parseStoredPaymentIntent(command);
    if (command.providerResultHash?.startsWith('sha256:')) {
      const actual = paymentIntentResultHash(response);
      if (actual !== command.providerResultHash) throw evidenceMismatch();
    }
    return response;
  }
  throw lifecycleConflict(command.status);
}

function lifecycleConflict(status: OnlinePaymentIntentCommand['status']): ConflictError {
  if (status === 'creation_unknown' || status === 'cancel_pending' || status === 'manual_review') {
    return new ConflictError(
      'payment_intent_creation_unknown',
      'Результат создания платежа уточняется; повторная отправка заблокирована',
    );
  }
  if (status === 'cancelled') {
    return new ConflictError('payment_intent_cancelled', 'Создание платежа отменено');
  }
  if (status === 'creation_failed' || status === 'payment_failed') {
    return new ConflictError('payment_intent_failed', 'Создать платёжный intent не удалось');
  }
  if (status === 'expired') {
    return new ConflictError('payment_intent_expired', 'Платёжный intent истёк');
  }
  return new ConflictError('payment_intent_in_progress', 'Платёжный intent ещё создаётся');
}

function assertProviderIntent(
  intent: PaymentIntentView,
  dto: CreatePaymentIntentDto,
  orderStatus: OrderStatus,
  gatewayMode: string,
  requireFresh = true,
): void {
  const expiresAt = Date.parse(intent.expiresAt);
  if (
    !intent.intentId
    || !intent.provider
    || !intent.txnId
    || intent.orderId !== dto.orderId
    || intent.orderStatus !== orderStatus
    || intent.method !== dto.method
    || intent.amount !== dto.amount
    || intent.status !== 'requires_action'
    || !Number.isFinite(expiresAt)
    || (requireFresh && expiresAt <= Date.now())
    || !isSafeProviderActionUrl(intent.paymentUrl, gatewayMode)
    || !isSafeQrPayload(intent.qrPayload, intent.method)
  ) {
    throw new Error('invalid_provider_intent');
  }
}

function parseStoredPaymentIntent(command: OnlinePaymentIntentCommand): PaymentIntentView {
  const value = command.response;
  if (!value || Array.isArray(value) || typeof value !== 'object') throw evidenceMismatch();
  const record = value as Record<string, unknown>;
  if (
    typeof record.intentId !== 'string'
    || typeof record.provider !== 'string'
    || typeof record.orderId !== 'string'
    || typeof record.orderStatus !== 'string'
    || !Object.values(OrderStatus).includes(record.orderStatus as OrderStatus)
    || typeof record.method !== 'string'
    || typeof record.amount !== 'number'
    || typeof record.txnId !== 'string'
    || record.status !== 'requires_action'
    || typeof record.expiresAt !== 'string'
    || typeof record.paymentUrl !== 'string'
    || !(record.qrPayload === null || typeof record.qrPayload === 'string')
  ) {
    throw evidenceMismatch();
  }
  const response = record as unknown as PaymentIntentView;
  if (
    response.orderId !== command.orderId
    || response.method !== command.method
    || response.amount !== command.amount
    || response.provider !== command.providerName
    || response.intentId !== command.providerIntentId
    || response.txnId !== command.providerTxnId
  ) {
    throw evidenceMismatch();
  }
  assertProviderIntent(
    response,
    { orderId: command.orderId, method: command.method as CreatePaymentIntentDto['method'], amount: command.amount },
    response.orderStatus,
    command.gatewayMode,
    false,
  );
  return response;
}

function evidenceMismatch(): ConflictError {
  return new ConflictError('payment_intent_evidence_mismatch', 'Платёжный intent требует ручной проверки');
}

function isSafeProviderActionUrl(value: string, gatewayMode: string): boolean {
  try {
    if (gatewayMode === 'sandbox') {
      const url = new URL(value, 'https://sandbox.alistore.invalid');
      return !value.startsWith('//')
        && url.origin === 'https://sandbox.alistore.invalid'
        && url.pathname.startsWith('/api/sandbox/payments/')
        && !url.username
        && !url.password;
    }
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isSafeQrPayload(value: string | null, method: CreatePaymentIntentDto['method']): boolean {
  if (method !== 'qr_mbank' && method !== 'qr_odengi') return value === null;
  if (!value) return false;
  try {
    const url = new URL(value);
    const expectedProtocol = method === 'qr_mbank' ? 'alistore-mbank:' : 'alistore-odengi:';
    return url.protocol === expectedProtocol && url.hostname === 'pay' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function paymentIntentEvidence(intent: PaymentIntentView): Record<string, unknown> {
  return {
    amount: intent.amount ?? null,
    expiresAt: intent.expiresAt ?? null,
    intentId: intent.intentId ?? null,
    method: intent.method ?? null,
    orderId: intent.orderId ?? null,
    orderStatus: intent.orderStatus ?? null,
    provider: intent.provider ?? null,
    status: intent.status ?? null,
    txnId: intent.txnId ?? null,
  };
}

function paymentIntentResultHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
  return `{${entries.join(',')}}`;
}

function assertSafeReturnUrl(value: string | undefined): void {
  if (!value) return;
  try {
    const url = new URL(value);
    const appReturn = url.protocol === 'alistore:'
      && url.hostname === 'payment-return'
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
    const webReturn = url.protocol === 'https:'
      && ['https://ali.kg', 'https://www.ali.kg'].includes(url.origin)
      && url.pathname.startsWith('/account/orders/')
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
    if (appReturn || webReturn) return;
  } catch {
    // The public contract is fail-closed; malformed URLs share one safe error.
  }
  throw new ValidationError('invalid_payment_return_url', 'Недопустимый returnUrl платежа');
}

function safeErrorCode(error: unknown): string {
  if (error instanceof ConflictError || error instanceof ValidationError) return error.code;
  if (error instanceof CustomerSessionRevokedException) return 'customer_session_revoked';
  return 'provider_or_persistence_error';
}
