import { AuditService } from '../src/audit/audit.service';
import { ConflictError, ValidationError } from '../src/common/errors';
import { OrdersService } from '../src/orders/orders.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { PaymentIntentsService } from '../src/payments/payment-intents.service';
import { PaymentsService } from '../src/payments/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { UnitsService } from '../src/units/units.service';
import { SandboxPaymentGatewayProvider } from '../src/payments/sandbox-payment-gateway.provider';
import { ProductionPaymentGatewayProvider } from '../src/payments/production-payment-gateway.provider';
import { ConfigService } from '@nestjs/config';
import { PaymentWebhookDto } from '../src/payments/payment-intents.dto';
import { SANDBOX_WEBHOOK_SECRET, signedSandboxWebhook } from './helpers/sandbox-webhook';

describe('Online payment intents (integration)', () => {
  let prisma: PrismaService;
  let orders: OrdersService;
  let intents: PaymentIntentsService;
  let payments: PaymentsService;
  let units: UnitsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    units = new UnitsService(prisma);
    orders = new OrdersService(prisma, audit, units);
    payments = new PaymentsService(prisma, audit, units, new ApprovalsService(prisma, audit));
    intents = new PaymentIntentsService(prisma, orders, payments, new SandboxPaymentGatewayProvider(SANDBOX_WEBHOOK_SECRET));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.onlinePaymentIntentCommand.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function webOrder() {
    seq += 1;
    const customer = await prisma.customer.create({ data: { phone: `+9967018${seq.toString().padStart(4, '0')}`, name: 'Pay Web' } });
    const product = await prisma.product.create({
      data: { sku: `PAY-${seq}`, name: 'iPhone Pay', price: 100000, cost: 82000, category: 'phones', attrs: {} },
    });
    await prisma.deviceUnit.create({ data: { imei: `PAY-IMEI-${seq}`, productId: product.id, status: 'in_stock', location: 'BISHKEK-1' } });
    return orders.create(
      { customerId: customer.id, channel: 'web', total: 100000, items: [{ sku: product.sku, qty: 1, price: 100000 }] },
      'web',
    );
  }

  function webhook(payload: PaymentWebhookDto) {
    return intents.webhook(payload, signedSandboxWebhook(payload));
  }

  it('creates a QR intent by reserving stock, then confirms payment idempotently', async () => {
    const order = await webOrder();

    const intent = await intents.create({ orderId: order.id, method: 'qr_mbank', amount: 100000, actor: 'web_checkout' });
    expect(intent.provider).toBe('mbank');
    expect(intent.orderStatus).toBe('awaiting_payment');
    expect(intent.qrPayload).toContain('alistore-mbank://pay');

    const reserved = await prisma.deviceUnit.findFirst({ where: { orderId: order.id } });
    expect(reserved?.status).toBe('reserved');
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('awaiting_payment');

    const paid = await webhook({
      orderId: order.id,
      method: 'qr_mbank',
      amount: 100000,
      txnId: intent.txnId,
      status: 'succeeded',
      actor: 'mbank',
    });
    expect(paid.order?.status).toBe('paid');
    expect(paid.payment.method).toBe('qr_mbank');
    expect(paid.idempotent).toBe(false);

    const again = await webhook({
      orderId: order.id,
      method: 'qr_mbank',
      amount: 100000,
      txnId: intent.txnId,
      status: 'succeeded',
      actor: 'mbank',
    });
    expect(again.idempotent).toBe(true);
    expect(await prisma.payment.count({ where: { txnId: intent.txnId } })).toBe(1);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold', orderId: order.id } })).toBe(1);
    expect(await prisma.onlinePaymentIntentCommand.findFirst({ where: { providerTxnId: intent.txnId } }))
      .toMatchObject({ status: 'paid' });
    await expect(intents.create({ orderId: order.id, method: 'qr_mbank', amount: 100000 }))
      .rejects.toMatchObject({ code: 'payment_intent_already_paid' });
    expect(await prisma.onlinePaymentIntentCommand.findFirst({ where: { providerTxnId: intent.txnId } }))
      .toMatchObject({ response: null });
  });

  it('is race-safe: two concurrent webhooks with the same txnId apply the payment once', async () => {
    const order = await webOrder();
    const intent = await intents.create({ orderId: order.id, method: 'qr_mbank', amount: 100000, actor: 'web_checkout' });
    const hook = () =>
      webhook({ orderId: order.id, method: 'qr_mbank', amount: 100000, txnId: intent.txnId, status: 'succeeded', actor: 'mbank' });

    // Providers commonly re-deliver a webhook on timeout; both land simultaneously here.
    const results = await Promise.allSettled([hook(), hook()]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    // Applied exactly once regardless of the race — one payment, one sold unit, order paid.
    expect(await prisma.payment.count({ where: { txnId: intent.txnId } })).toBe(1);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold', orderId: order.id } })).toBe(1);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('paid');
    expect(await prisma.onlinePaymentIntentCommand.findFirst({ where: { providerTxnId: intent.txnId } }))
      .toMatchObject({ status: 'paid', response: null });
  });

  it('heals a crash after money commits but before the command publication is cleared', async () => {
    const order = await webOrder();
    const intent = await intents.create({ orderId: order.id, method: 'card', amount: 100000 });
    await payments.pay(
      { orderId: order.id, method: 'card', amount: 100000, txnId: intent.txnId },
      'provider:card',
    );
    expect(await prisma.onlinePaymentIntentCommand.findFirst({ where: { providerTxnId: intent.txnId } }))
      .toMatchObject({ status: 'requires_action', response: expect.any(Object) });

    await expect(intents.create({ orderId: order.id, method: 'card', amount: 100000 }))
      .rejects.toMatchObject({ code: 'payment_intent_already_paid' });
    expect(await prisma.onlinePaymentIntentCommand.findFirst({ where: { providerTxnId: intent.txnId } }))
      .toMatchObject({ status: 'paid', response: null });
  });

  it('does not attribute an unrelated settled tender to the original provider intent', async () => {
    const order = await webOrder();
    const intent = await intents.create({ orderId: order.id, method: 'card', amount: 100000 });
    await payments.pay(
      { orderId: order.id, method: 'cash', amount: 100000, txnId: `cash-${order.id}` },
      'cashier:test',
    );

    await expect(intents.create({ orderId: order.id, method: 'card', amount: 100000 }))
      .rejects.toMatchObject({ code: 'payment_intent_creation_unknown' });
    expect(await prisma.onlinePaymentIntentCommand.findFirst({ where: { providerTxnId: intent.txnId } }))
      .toMatchObject({
        status: 'manual_review',
        response: null,
        lastErrorCode: 'payment_intent_settlement_mismatch',
      });
  });

  it('rejects an amount mismatch and already-paid orders', async () => {
    const order = await webOrder();
    const mismatch = await intents.create({ orderId: order.id, method: 'card', amount: 999 }).catch((e) => e);
    expect(mismatch).toBeInstanceOf(ValidationError);
    expect(mismatch.code).toBe('payment_amount_mismatch');

    const intent = await intents.create({ orderId: order.id, method: 'card', amount: 100000 });
    await webhook({ orderId: order.id, method: 'card', amount: 100000, txnId: intent.txnId, status: 'succeeded' });
    const paidAgain = await intents.create({ orderId: order.id, method: 'card', amount: 100000 }).catch((e) => e);
    expect(paidAgain).toBeInstanceOf(ConflictError);
    expect(paidAgain.code).toBe('order_already_paid');
  });

  it('creates a customer intent only for an order owned by that JWT principal', async () => {
    const order = await webOrder();
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    await expect(intents.createForCustomer('another-customer', {
      orderId: order.id,
      method: 'card',
      amount: 100000,
    }, 'wrong-owner-key')).rejects.toMatchObject({ code: 'order_not_found' });

    await expect(intents.createForCustomer(stored.customerId, {
      orderId: order.id,
      method: 'card',
      amount: 100000,
    })).rejects.toMatchObject({ code: 'idempotency_key_required' });

    const intent = await intents.createForCustomer(stored.customerId, {
      orderId: order.id,
      method: 'card',
      amount: 100000,
    }, 'owned-order-key');
    expect(intent.orderId).toBe(order.id);
    expect(intent.orderStatus).toBe('awaiting_payment');
  });

  it('replays a customer intent by idempotency key and rejects payload reuse', async () => {
    const order = await webOrder();
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const request = { orderId: order.id, method: 'card' as const, amount: 100000, returnUrl: 'alistore://payment-return' };

    const first = await intents.createForCustomer(stored.customerId, request, 'intent-key-1');
    const replay = await intents.createForCustomer(stored.customerId, request, 'intent-key-1');

    expect(replay).toEqual(first);
    expect(await prisma.onlinePaymentIntentCommand.count()).toBe(1);
    await expect(intents.createForCustomer(stored.customerId, { ...request, method: 'qr_mbank' }, 'intent-key-1'))
      .rejects.toMatchObject({ code: 'idempotency_key_reused' });
    const paid = await intents.confirmSandboxIntent(first.intentId);
    expect(paid.order?.status).toBe('paid');
    const duplicate = await intents.confirmSandboxIntent(first.intentId);
    expect(duplicate.idempotent).toBe(true);
  });

  it('rejects untrusted payment return URLs before persisting a command', async () => {
    const order = await webOrder();
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    await expect(intents.createForCustomer(stored.customerId, {
      orderId: order.id,
      method: 'card',
      amount: 100000,
      returnUrl: 'https://attacker.example/steal?token=secret',
    }, 'unsafe-return-key')).rejects.toMatchObject({ code: 'invalid_payment_return_url' });
    expect(await prisma.onlinePaymentIntentCommand.count()).toBe(0);
  });

  it('moves naturally expired action intents to a terminal non-action state', async () => {
    const gateway = new ShortLivedSandboxGateway();
    const expiring = new PaymentIntentsService(prisma, orders, payments, gateway);
    const replayOrder = await webOrder();
    const replayOwner = await prisma.order.findUniqueOrThrow({ where: { id: replayOrder.id } });
    const replayIntent = await expiring.createForCustomer(
      replayOwner.customerId,
      { orderId: replayOrder.id, method: 'card', amount: 100000 },
      'expires-on-replay',
    );
    const confirmOrder = await webOrder();
    const confirmOwner = await prisma.order.findUniqueOrThrow({ where: { id: confirmOrder.id } });
    const confirmIntent = await expiring.createForCustomer(
      confirmOwner.customerId,
      { orderId: confirmOrder.id, method: 'card', amount: 100000 },
      'expires-on-confirm',
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    await expect(expiring.createForCustomer(
      replayOwner.customerId,
      { orderId: replayOrder.id, method: 'card', amount: 100000 },
      'expires-on-replay',
    )).rejects.toMatchObject({ code: 'payment_intent_expired' });
    await expect(expiring.confirmSandboxIntent(confirmIntent.intentId))
      .rejects.toMatchObject({ code: 'payment_intent_expired' });
    expect(await prisma.onlinePaymentIntentCommand.findMany({
      where: { providerIntentId: { in: [replayIntent.intentId, confirmIntent.intentId] } },
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'expired', response: null }),
      expect.objectContaining({ status: 'expired', response: null }),
    ]));
  });

  it('derives stable sandbox transaction identifiers from the provider idempotency key', async () => {
    const gateway = new SandboxPaymentGatewayProvider();
    const input = {
      idempotencyKey: 'provider-key-1', orderId: 'order-1', orderStatus: 'awaiting_payment' as const,
      method: 'card' as const, amount: 100000,
    };
    const first = await gateway.createIntent(input);
    const replay = await gateway.createIntent(input);
    expect(replay.intentId).toBe(first.intentId);
    expect(replay.txnId).toBe(first.txnId);
  });

  it('never redispatches an ambiguous provider outcome for the same customer key', async () => {
    const order = await webOrder();
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const gateway = new AmbiguousSandboxGateway();
    const ambiguous = new PaymentIntentsService(prisma, orders, payments, gateway);
    const request = { orderId: order.id, method: 'card' as const, amount: 100000 };

    await expect(ambiguous.createForCustomer(stored.customerId, request, 'ambiguous-key'))
      .rejects.toMatchObject({ code: 'payment_intent_creation_unknown' });
    await expect(ambiguous.createForCustomer(stored.customerId, request, 'ambiguous-key'))
      .rejects.toMatchObject({ code: 'payment_intent_creation_unknown' });

    expect(gateway.createCalls).toBe(1);
    expect(await prisma.onlinePaymentIntentCommand.findFirst({
      where: { customerId: stored.customerId },
    })).toMatchObject({ status: 'creation_unknown', attempts: 1 });
  });

  it('never bypasses a quarantined legacy auto-key command for the same payment tuple', async () => {
    const gateway = new AmbiguousSandboxGateway();
    const guarded = new PaymentIntentsService(prisma, orders, payments, gateway);
    for (const legacyOwner of ['web_checkout', 'system:payment-intent']) {
      const order = await webOrder();
      await prisma.onlinePaymentIntentCommand.create({
        data: {
          idempotencyKey: `payment-intent:${order.id}:card:100000`,
          providerIdempotencyKey: `legacy:${order.id}`,
          requestHash: `legacy-columns-v1:${order.id}`,
          customerId: legacyOwner,
          orderId: order.id,
          method: 'card',
          amount: 100000,
          gatewayMode: 'legacy-unknown',
          status: 'creation_unknown',
        },
      });
      await expect(guarded.create({ orderId: order.id, method: 'card', amount: 100000 }))
        .rejects.toMatchObject({ code: 'payment_intent_creation_unknown' });
    }
    expect(gateway.createCalls).toBe(0);
    expect(await prisma.onlinePaymentIntentCommand.count()).toBe(2);
  });

  it('claims a concurrent same-key request before the provider boundary', async () => {
    const order = await webOrder();
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const gateway = new BlockingSandboxGateway();
    const concurrent = new PaymentIntentsService(prisma, orders, payments, gateway);
    const request = { orderId: order.id, method: 'card' as const, amount: 100000 };

    const first = concurrent.createForCustomer(stored.customerId, request, 'concurrent-key');
    await gateway.waitUntilCalled();
    const second = concurrent.createForCustomer(stored.customerId, request, 'concurrent-key');
    await expect(second).rejects.toMatchObject({ code: 'payment_intent_in_progress' });
    gateway.release();
    await expect(first).resolves.toMatchObject({ orderId: order.id, amount: 100000 });

    expect(gateway.createCalls).toBe(1);
    expect(await prisma.onlinePaymentIntentCommand.count()).toBe(1);
  });

  it('preserves a late provider success after a stale lease is quarantined', async () => {
    const order = await webOrder();
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const gateway = new BlockingSandboxGateway();
    const concurrent = new PaymentIntentsService(prisma, orders, payments, gateway);
    const request = { orderId: order.id, method: 'card' as const, amount: 100000 };

    const first = concurrent.createForCustomer(stored.customerId, request, 'late-success-key');
    await gateway.waitUntilCalled();
    await prisma.onlinePaymentIntentCommand.updateMany({
      where: { customerId: stored.customerId, status: 'creating' },
      data: { leaseUntil: new Date(Date.now() - 1000) },
    });
    await expect(concurrent.createForCustomer(stored.customerId, request, 'late-success-key'))
      .rejects.toMatchObject({ code: 'payment_intent_creation_unknown' });
    expect(await prisma.onlinePaymentIntentCommand.findFirst({ where: { customerId: stored.customerId } }))
      .toMatchObject({ status: 'creation_unknown', claimToken: expect.any(String) });

    gateway.release();
    await expect(first).resolves.toMatchObject({ orderId: order.id, amount: 100000 });
    expect(await prisma.onlinePaymentIntentCommand.findFirst({ where: { customerId: stored.customerId } }))
      .toMatchObject({
        status: 'requires_action',
        claimToken: null,
        providerIntentId: expect.any(String),
        providerTxnId: expect.any(String),
      });
  });

  it('rejects signed but unknown or mismatched webhooks before applying money', async () => {
    const order = await webOrder();
    const intent = await intents.create({ orderId: order.id, method: 'card', amount: 100000 });
    const unknown = {
      orderId: order.id,
      method: 'card' as const,
      amount: 100000,
      txnId: 'unknown-provider-txn',
      status: 'succeeded' as const,
    };
    await expect(intents.webhook(unknown, signedSandboxWebhook(unknown)))
      .rejects.toMatchObject({ code: 'payment_webhook_not_correlated' });

    const mismatch = {
      orderId: order.id,
      method: 'card' as const,
      amount: 99999,
      txnId: intent.txnId,
      status: 'succeeded' as const,
    };
    await expect(intents.webhook(mismatch, signedSandboxWebhook(mismatch)))
      .rejects.toMatchObject({ code: 'payment_webhook_mismatch' });
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('records a correlated provider failure without creating money', async () => {
    const order = await webOrder();
    const intent = await intents.create({ orderId: order.id, method: 'card', amount: 100000 });
    const failed = {
      orderId: order.id,
      method: 'card' as const,
      amount: 100000,
      txnId: intent.txnId,
      status: 'failed' as const,
      actor: 'forged-admin',
    };
    await expect(intents.webhook(failed, signedSandboxWebhook(failed)))
      .rejects.toMatchObject({ code: 'payment_failed' });
    expect(await prisma.onlinePaymentIntentCommand.findFirst({
      where: { providerTxnId: intent.txnId },
    })).toMatchObject({ status: 'payment_failed', lastErrorCode: 'provider_payment_failed' });
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('quarantines contradictory success and failure callbacks regardless of their race', async () => {
    const order = await webOrder();
    const intent = await intents.create({ orderId: order.id, method: 'card', amount: 100000 });
    const succeeded = {
      orderId: order.id,
      method: 'card' as const,
      amount: 100000,
      txnId: intent.txnId,
      status: 'succeeded' as const,
    };
    const failed = { ...succeeded, status: 'failed' as const };
    const outcomes = await Promise.allSettled([
      intents.webhook(succeeded, signedSandboxWebhook(succeeded)),
      intents.webhook(failed, signedSandboxWebhook(failed)),
    ]);

    expect(outcomes.some((outcome) => outcome.status === 'fulfilled')).toBe(true);
    expect(await prisma.payment.count({ where: { txnId: intent.txnId } })).toBe(1);
    expect(await prisma.onlinePaymentIntentCommand.findFirst({
      where: { providerTxnId: intent.txnId },
    })).toMatchObject({ status: 'manual_review', response: null });
  });

  it('retains provider evidence but never returns an action URL after account deletion wins finalization', async () => {
    const order = await webOrder();
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const gateway = new BlockingSandboxGateway();
    const concurrent = new PaymentIntentsService(prisma, orders, payments, gateway);
    const creation = concurrent.createForCustomer(
      stored.customerId,
      { orderId: order.id, method: 'card', amount: 100000 },
      'delete-during-provider',
    );
    await gateway.waitUntilCalled();
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${stored.customerId} FOR UPDATE`;
      await tx.customer.update({
        where: { id: stored.customerId },
        data: { phone: `deleted:${stored.customerId}` },
      });
    });
    gateway.release();

    await expect(creation).rejects.toMatchObject({ status: 401 });
    expect(await prisma.onlinePaymentIntentCommand.findFirst({
      where: { customerId: stored.customerId },
    })).toMatchObject({
      status: 'cancel_pending',
      response: null,
      providerIntentId: expect.any(String),
      providerTxnId: expect.any(String),
    });
  });

  it('fails before reserving stock when the selected production adapter is not activated', async () => {
    const order = await webOrder();
    const production = new PaymentIntentsService(
      prisma,
      orders,
      payments,
      new ProductionPaymentGatewayProvider({
        apiUrl: 'https://payments.example.test',
        merchantId: 'merchant',
        apiKey: 'secret',
        webhookSecret: 'webhook-secret',
      }),
    );

    await expect(production.create({ orderId: order.id, method: 'card', amount: 100000 }))
      .rejects.toMatchObject({ status: 503 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('created');
    expect(await prisma.deviceUnit.count({ where: { status: 'in_stock' } })).toBe(1);
  });

  it('creates a sandbox intent for demo without reserving, paying, or selling stock', async () => {
    const demoOrders = new OrdersService(
      prisma,
      new AuditService(prisma),
      units,
      undefined,
      new ConfigService({ PUBLIC_DEMO_MODE: 'true' }),
    );
    seq += 1;
    const customer = await prisma.customer.create({ data: { phone: `+9967028${seq.toString().padStart(4, '0')}`, name: 'Demo customer' } });
    const product = await prisma.product.create({ data: { sku: `DEMO-PAY-${seq}`, name: 'Demo phone', price: 100000, cost: 80000, category: 'phones', attrs: {} } });
    await prisma.deviceUnit.create({ data: { imei: `DEMO-IMEI-${seq}`, productId: product.id, status: 'in_stock', location: 'BISHKEK-1' } });
    const order = await demoOrders.create({ customerId: customer.id, channel: 'web', total: 100000, items: [{ sku: product.sku, qty: 1, price: 100000 }] }, 'demo:web');
    const demoIntents = new PaymentIntentsService(prisma, demoOrders, payments, new SandboxPaymentGatewayProvider(SANDBOX_WEBHOOK_SECRET));

    const intent = await demoIntents.create({ orderId: order.id, method: 'card', amount: 100000 });
    expect(intent.orderStatus).toBe('created');
    expect(await prisma.reservation.count({ where: { orderId: order.id } })).toBe(0);
    const demoWebhook = { orderId: order.id, method: 'card' as const, amount: 100000, txnId: intent.txnId, status: 'succeeded' as const };
    await expect(demoIntents.webhook(demoWebhook, signedSandboxWebhook(demoWebhook)))
      .rejects.toMatchObject({ code: 'demo_payment_forbidden' });
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
    expect((await prisma.deviceUnit.findFirstOrThrow({ where: { productId: product.id } })).status).toBe('in_stock');
  });
});

class AmbiguousSandboxGateway extends SandboxPaymentGatewayProvider {
  createCalls = 0;

  override async createIntent(
    input: Parameters<SandboxPaymentGatewayProvider['createIntent']>[0],
  ): Promise<never> {
    this.createCalls += 1;
    await super.createIntent(input);
    throw new Error('simulated_provider_timeout_after_accept');
  }
}

class BlockingSandboxGateway extends SandboxPaymentGatewayProvider {
  createCalls = 0;
  private readonly called = deferred<void>();
  private readonly released = deferred<void>();

  waitUntilCalled(): Promise<void> {
    return this.called.promise;
  }

  release(): void {
    this.released.resolve(undefined);
  }

  override async createIntent(input: Parameters<SandboxPaymentGatewayProvider['createIntent']>[0]) {
    this.createCalls += 1;
    this.called.resolve(undefined);
    await this.released.promise;
    return super.createIntent(input);
  }
}

class ShortLivedSandboxGateway extends SandboxPaymentGatewayProvider {
  override async createIntent(input: Parameters<SandboxPaymentGatewayProvider['createIntent']>[0]) {
    const intent = await super.createIntent(input);
    return { ...intent, expiresAt: new Date(Date.now() + 250).toISOString() };
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}
