import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { CreateOrderDto } from '../src/orders/orders.dto';
import { PaymentsService } from '../src/payments/payments.service';
import { PaymentIntentsService } from '../src/payments/payment-intents.service';
import { GiftcardsService } from '../src/giftcards/giftcards.service';
import { CourierService } from '../src/courier/courier.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { ReservationsService } from '../src/reservations/reservations.service';
import { SandboxPaymentGatewayProvider } from '../src/payments/sandbox-payment-gateway.provider';
import { PaymentWebhookDto } from '../src/payments/payment-intents.dto';
import { SANDBOX_WEBHOOK_SECRET, signedSandboxWebhook } from './helpers/sandbox-webhook';

/**
 * Cancel compensation (LOGIC-011/LOGIC-004):
 *  1. a settled (paid) order cannot be cancelled directly — it must go through the
 *     return/refund contour; unpaid orders cancel as before;
 *  2. cancelling an unpaid order with redeemed loyalty / partial gift-card tender
 *     restores points and card balances in the same transaction;
 *  3. a repeated payment intent for the same order+method+amount replays the open
 *     intent instead of issuing a second payable txnId;
 *  4. a provider webhook for a no-longer-payable order parks the money as a
 *     traceable Payment row (refundable) instead of looping a bare 409;
 *  5. cancelling a COD order that sits in an active courier run subtracts its COD
 *     from the run's expected codTotal.
 */
describe('Cancel compensation (integration)', () => {
  let prisma: PrismaService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let giftcards: GiftcardsService;
  let intents: PaymentIntentsService;
  let courier: CourierService;
  let outbox: OutboxService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const units = new UnitsService(prisma);
    const approvals = new ApprovalsService(prisma, audit);
    orders = new OrdersService(prisma, audit, units);
    giftcards = new GiftcardsService(prisma, audit);
    payments = new PaymentsService(prisma, audit, units, approvals, giftcards, orders);
    intents = new PaymentIntentsService(prisma, orders, payments, new SandboxPaymentGatewayProvider(SANDBOX_WEBHOOK_SECRET));
    outbox = new OutboxService(prisma, { deliver: async () => undefined });
    courier = new CourierService(prisma, audit, outbox, units);
  });

  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await clean();
    // Наличная продажа подарочной карты видна в кассовой смене
    // (`shifts/cash-drawer.ts`): проводка Дт 1000 утверждает приход наличных, и
    // это утверждение обязано сверяться с ящиком. Спек написан до контроля.
    await prisma.cashShift.deleteMany({ where: { staffId: 'cashier' } });
    await prisma.cashShift.create({
      data: { staffId: 'cashier', point: 'BISHKEK-1', openCash: 0, openedAt: new Date() },
    });
  });

  async function clean() {
    await prisma.onlinePaymentIntentCommand.deleteMany();
    await prisma.courierCommand.deleteMany();
    await prisma.outboxMessage.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.giftCard.deleteMany();
    await prisma.loyaltyEntry.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: 'cancel-comp-' } } });
    await prisma.approval.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.$transaction([
      prisma.accountingJournalLine.deleteMany({ where: { entry: { sourceType: { startsWith: 'payment.' } } } }),
      prisma.accountingJournalEntry.deleteMany({ where: { sourceType: { startsWith: 'payment.' } } }),
    ]);
  }

  async function webOrder(options: {
    total?: number;
    loyaltyPoints?: number;
    seedLoyalty?: number;
    extra?: Partial<CreateOrderDto>;
  } = {}) {
    const total = options.total ?? 100000;
    const loyaltyPoints = options.loyaltyPoints ?? 0;
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967055${seq.toString().padStart(4, '0')}`, name: 'Cancel Comp' },
    });
    if (options.seedLoyalty) {
      await prisma.loyaltyEntry.create({
        data: { customerId: customer.id, kind: 'earn', label: 'seed', amount: options.seedLoyalty, sourceRef: `seed:${seq}` },
      });
    }
    const product = await prisma.product.create({
      data: { sku: `CC-${seq}`, name: 'iPhone Cancel', price: total, cost: Math.floor(total * 0.8), category: 'phones', attrs: {} },
    });
    await prisma.deviceUnit.create({
      data: { imei: `CC-IMEI-${seq}`, productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
    });
    const order = await orders.create(
      {
        customerId: customer.id,
        channel: 'web',
        total,
        loyaltyPoints,
        items: [{ sku: product.sku, qty: 1, price: total }],
        ...options.extra,
      },
      'web',
      undefined,
      { subtotal: total, deliveryFee: 0, promoCode: null, promoDiscount: 0, loyaltyPoints },
    );
    return { order, customer, product };
  }

  async function paidOrder() {
    const seeded = await webOrder();
    const intent = await intents.create({ orderId: seeded.order.id, method: 'qr_mbank', amount: 100000, actor: 'web_checkout' });
    await webhook({
      orderId: seeded.order.id,
      method: 'qr_mbank',
      amount: 100000,
      txnId: intent.txnId,
      status: 'succeeded',
      actor: 'mbank',
    });
    return seeded;
  }

  function webhook(payload: PaymentWebhookDto) {
    return intents.webhook(payload, signedSandboxWebhook(payload));
  }

  it('forbids a direct cancel of a settled order and keeps the return contour as the path', async () => {
    const { order } = await paidOrder();
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('paid');

    await expect(orders.transition(order.id, 'cancelled', 'support')).rejects.toMatchObject({
      code: 'paid_order_cancel_requires_return',
    });

    // The sanctioned path for a paid order stays available.
    const returned = await orders.transition(order.id, 'return_requested', 'support');
    expect(returned.status).toBe('return_requested');

    // The defect path: a settled order that already moved into fulfillment —
    // its units are sold and its money is received, so a plain cancel would strand both.
    const inFlight = await paidOrder();
    await orders.transition(inFlight.order.id, 'picking', 'warehouse');
    await expect(orders.transition(inFlight.order.id, 'cancelled', 'support')).rejects.toMatchObject({
      code: 'paid_order_cancel_requires_return',
    });
    const kept = await prisma.order.findUniqueOrThrow({ where: { id: inFlight.order.id }, include: { payments: true } });
    expect(kept.status).toBe('picking');
    expect(kept.payments).toHaveLength(1);
    expect(await prisma.deviceUnit.count({ where: { orderId: inFlight.order.id, status: 'sold' } })).toBe(1);

    // …and the same guard once the settled order is dispatched with a courier.
    await orders.transition(inFlight.order.id, 'packed', 'warehouse');
    const staff = await prisma.staffUser.create({
      data: { username: `cancel-comp-courier-${++seq}`, passwordHash: 'test-only', role: 'courier' },
    });
    await prisma.order.update({ where: { id: inFlight.order.id }, data: { fulfillmentType: 'courier' } });
    await courier.createRun({ courierId: staff.id, codTotal: 0, orderIds: [inFlight.order.id] }, 'dispatcher', `assign-prepaid-${seq}`);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: inFlight.order.id } })).status).toBe('courier_assigned');
    await expect(orders.transition(inFlight.order.id, 'cancelled', 'support')).rejects.toMatchObject({
      code: 'paid_order_cancel_requires_return',
    });

    // Unpaid orders keep cancelling as before.
    const unpaid = await webOrder();
    await orders.fulfill(unpaid.order.id, 'seller');
    const cancelled = await orders.transition(unpaid.order.id, 'cancelled', 'customer');
    expect(cancelled.status).toBe('cancelled');
    expect((await prisma.deviceUnit.findFirstOrThrow({ where: { productId: unpaid.product.id } })).status).toBe('in_stock');
  });

  it('restores loyalty points and gift-card balance when cancelling an unpaid order', async () => {
    const { order, customer, product } = await webOrder({ total: 100000, loyaltyPoints: 300, seedLoyalty: 40000 });
    expect(order.loyaltyRedeemed).toBe(300);
    expect(order.total).toBe(99700);

    await orders.fulfill(order.id, 'seller');
    const card = await giftcards.issue({ code: `GC-CANCEL-${seq}`, amount: 50000 }, 'cashier');
    await payments.payMany(
      { orderId: order.id, payments: [{ method: 'gift_card', amount: 40000, giftCardCode: card.code, txnId: `gc-cancel-${seq}` }] },
      'cashier',
    );
    expect((await prisma.giftCard.findUniqueOrThrow({ where: { code: card.code } })).balance).toBe(10000);
    await orders.transition(order.id, 'awaiting_payment', 'web_checkout');

    const cancelled = await orders.transition(order.id, 'cancelled', 'customer');
    expect(cancelled.status).toBe('cancelled');

    // Loyalty points are back on the customer.
    const loyalty = await prisma.loyaltyEntry.aggregate({
      where: { customerId: customer.id },
      _sum: { amount: true },
    });
    expect(loyalty._sum.amount).toBe(40000);

    // Gift card is whole again, with a refund transaction trail.
    expect((await prisma.giftCard.findUniqueOrThrow({ where: { code: card.code } })).balance).toBe(50000);
    const refundTxn = await prisma.giftCardTransaction.findFirst({ where: { giftCard: { code: card.code }, type: 'refund' } });
    expect(refundTxn).toMatchObject({ amount: 40000, balanceAfter: 50000 });

    // The money ledger nets to zero through a compensating refund payment.
    const reversal = await prisma.payment.findFirst({ where: { orderId: order.id, amount: -40000 } });
    expect(reversal).toMatchObject({ method: 'gift_card', status: 'refunded' });
    const net = await prisma.payment.aggregate({ where: { orderId: order.id }, _sum: { amount: true } });
    expect(net._sum.amount).toBe(0);

    // Ledger events carry the compensation trail; stock is released.
    expect(await prisma.auditEvent.count({ where: { type: 'loyalty.refund_restored', refs: { has: order.id } } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'payment.refunded', refs: { has: order.id } } })).toBe(1);
    expect((await prisma.deviceUnit.findFirstOrThrow({ where: { productId: product.id } })).status).toBe('in_stock');
  });

  it('replays an open payment intent for the same order+method+amount instead of duplicating it', async () => {
    const { order } = await webOrder();

    const first = await intents.create({ orderId: order.id, method: 'qr_mbank', amount: 100000, actor: 'web_checkout' });
    const second = await intents.create({ orderId: order.id, method: 'qr_mbank', amount: 100000, actor: 'web_checkout' });

    expect(second.intentId).toBe(first.intentId);
    expect(second.txnId).toBe(first.txnId);

    const paid = await webhook({
      orderId: order.id, method: 'qr_mbank', amount: 100000, txnId: first.txnId, status: 'succeeded', actor: 'mbank',
    });
    expect(paid.order?.status).toBe('paid');
    const duplicate = await webhook({
      orderId: order.id, method: 'qr_mbank', amount: 100000, txnId: first.txnId, status: 'succeeded', actor: 'mbank',
    });
    expect(duplicate.idempotent).toBe(true);
    expect(await prisma.payment.count({ where: { txnId: first.txnId } })).toBe(1);
  });

  it('parks a webhook payment that arrives after the order was cancelled', async () => {
    const { order } = await webOrder();
    const intent = await intents.create({ orderId: order.id, method: 'qr_mbank', amount: 100000, actor: 'web_checkout' });
    await orders.transition(order.id, 'cancelled', 'customer');

    const parked = (await webhook({
      orderId: order.id, method: 'qr_mbank', amount: 100000, txnId: intent.txnId, status: 'succeeded', actor: 'mbank',
    })) as unknown as { parked: boolean; idempotent: boolean; payment: { id: string; orderId: string | null; amount: number; status: string } };
    expect(parked.parked).toBe(true);
    expect(parked.idempotent).toBe(false);
    expect(parked.payment).toMatchObject({ orderId: order.id, amount: 100000, status: 'pending' });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('cancelled');

    const replay = await webhook({
      orderId: order.id, method: 'qr_mbank', amount: 100000, txnId: intent.txnId, status: 'succeeded', actor: 'mbank',
    });
    expect(replay.idempotent).toBe(true);
    expect(await prisma.payment.count({ where: { txnId: intent.txnId } })).toBe(1);

    expect(await prisma.auditEvent.count({ where: { type: 'payment.parked', refs: { has: order.id } } })).toBe(1);

    // Parked money has a way back: the standard refund contour accepts the row.
    const approval = await payments.refund(parked.payment.id, 100000, 'webhook after cancel', 'admin');
    expect(approval.approvalId).toEqual(expect.any(String));
  });

  it('parks a webhook payment that arrives after the reservation was swept', async () => {
    const { order } = await webOrder();
    const intent = await intents.create({ orderId: order.id, method: 'qr_mbank', amount: 100000, actor: 'web_checkout' });

    // The reservation sweeper releases the expired hold and returns the order to confirmed.
    await prisma.reservation.updateMany({ where: { orderId: order.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    const sweeper = new ReservationsService(prisma, new AuditService(prisma), new UnitsService(prisma), outbox);
    const swept = await sweeper.releaseExpired(new Date());
    expect(swept.released).toBeGreaterThan(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('confirmed');

    const parked = (await webhook({
      orderId: order.id, method: 'qr_mbank', amount: 100000, txnId: intent.txnId, status: 'succeeded', actor: 'mbank',
    })) as unknown as { parked: boolean; idempotent: boolean; payment: { id: string; status: string } };
    expect(parked.parked).toBe(true);
    expect(parked.payment).toMatchObject({ status: 'pending' });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('confirmed');
    expect(await prisma.payment.count({ where: { txnId: intent.txnId } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'payment.parked', refs: { has: order.id } } })).toBe(1);
  });

  it('subtracts the cancelled COD order from its courier run codTotal', async () => {
    const staff = await prisma.staffUser.create({
      data: { username: `cancel-comp-courier-${++seq}`, passwordHash: 'test-only', role: 'courier' },
    });
    const { order } = await webOrder({
      total: 5000,
      extra: { channel: 'app', fulfillmentType: 'courier', paymentMode: 'cod', deliveryAddress: 'Бишкек, тест' },
    });
    await orders.fulfill(order.id, 'warehouse');
    await orders.transition(order.id, 'picking', 'warehouse');
    await orders.transition(order.id, 'packed', 'warehouse');
    const run = await courier.createRun(
      { courierId: staff.id, codTotal: 5000, orderIds: [order.id] },
      'dispatcher',
      `assign-cc-${seq}`,
    );
    expect(run.codTotal).toBe(5000);
    await courier.startDelivery(order.id, staff.id, `start-cc-${seq}`);

    const cancelled = await orders.transition(order.id, 'cancelled', 'dispatcher');
    expect(cancelled.status).toBe('cancelled');

    const adjusted = await prisma.courierRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(adjusted.codTotal).toBe(0);
    expect(await prisma.auditEvent.count({ where: { type: 'courier.cod_adjusted', refs: { has: run.id } } })).toBe(1);

    // A run whose COD was already handed over is immutable for this compensation.
    const handedOverRun = await prisma.courierRun.create({
      data: { courierId: staff.id, codTotal: 5000, collectedTotal: 5000, handedOver: true },
    });
    const second = await webOrder({ total: 5000 });
    await prisma.order.update({
      where: { id: second.order.id },
      data: {
        fulfillmentType: 'courier',
        paymentMode: 'cod',
        deliveryAddress: 'Бишкек, тест',
        status: 'courier_assigned',
        courierId: staff.id,
        courierRunId: handedOverRun.id,
      },
    });
    await orders.transition(second.order.id, 'cancelled', 'dispatcher');
    expect((await prisma.courierRun.findUniqueOrThrow({ where: { id: handedOverRun.id } })).codTotal).toBe(5000);
  });
});
