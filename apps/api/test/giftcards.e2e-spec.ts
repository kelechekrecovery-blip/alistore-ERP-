import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { ConflictError } from '../src/common/errors';
import { GiftcardsService } from '../src/giftcards/giftcards.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentIntentsService } from '../src/payments/payment-intents.service';
import { PaymentsService } from '../src/payments/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { clearGiftCardTransactions } from './db-test-cleanup';
import { UnitsService } from '../src/units/units.service';
import { SandboxPaymentGatewayProvider } from '../src/payments/sandbox-payment-gateway.provider';

describe('Gift cards / store credit (integration)', () => {
  let prisma: PrismaService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let giftcards: GiftcardsService;
  let intents: PaymentIntentsService;
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
    intents = new PaymentIntentsService(prisma, orders, payments, new SandboxPaymentGatewayProvider());
  });

  afterAll(async () => {
    await clearGiftCardTransactions(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await clearGiftCardTransactions(prisma);
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.giftCard.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.approval.deleteMany();
  });

  async function webOrder(total = 100000) {
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967044${seq.toString().padStart(4, '0')}`, name: 'Gift' },
    });
    const product = await prisma.product.create({
      data: {
        sku: `GFT-${seq}`,
        name: 'iPhone Gift',
        price: total,
        cost: Math.floor(total * 0.8),
        category: 'phones',
        attrs: {},
      },
    });
    await prisma.deviceUnit.create({
      data: {
        imei: `GFT-IMEI-${seq}`,
        productId: product.id,
        status: 'in_stock',
        location: 'BISHKEK-1',
      },
    });
    const order = await orders.create(
      {
        customerId: customer.id,
        channel: 'web',
        total,
        items: [{ sku: product.sku, qty: 1, price: total }],
      },
      'web',
    );
    return { order, customer };
  }

  async function reservedOrder(total = 100000) {
    const seeded = await webOrder(total);
    await orders.fulfill(seeded.order.id, 'seller');
    return seeded;
  }

  it('issues a card and pays a reserved order with gift-card + cash split tender', async () => {
    const { order } = await reservedOrder();
    const card = await giftcards.issue({ code: 'gc-split', amount: 50000 }, 'cashier');
    const staffId = 'giftcard-cashier';
    const shift = await prisma.cashShift.create({ data: { staffId, point: 'BISHKEK-1', openCash: 0 } });

    const paid = await payments.payMany(
      {
        orderId: order.id,
        payments: [
          { method: 'gift_card', amount: 30000, giftCardCode: card.code, txnId: 'gc-split-card' },
          { method: 'cash', amount: 70000, txnId: 'gc-split-cash' },
        ],
      },
      'cashier',
      { staffId },
    );

    expect(paid.order?.status).toBe('paid');
    expect(await prisma.giftCard.findUnique({ where: { code: card.code } })).toMatchObject({
      balance: 20000,
      status: 'active',
    });
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(2);
    const types = (await prisma.auditEvent.findMany()).map((event) => event.type);
    expect(types).toEqual(
      expect.arrayContaining(['giftcard.issued', 'giftcard.redeemed', 'payment.received', 'order.paid']),
    );
  });

  it('applies store credit first, then creates an online intent for the remaining due', async () => {
    const { order } = await webOrder();
    const card = await giftcards.issue({ code: 'gc-web', amount: 40000 }, 'cashier');

    const partial = await payments.pay(
      { orderId: order.id, method: 'gift_card', amount: 25000, giftCardCode: card.code },
      'web_checkout',
    );
    expect(partial.order?.status).toBe('reserved');
    expect((await prisma.giftCard.findUnique({ where: { code: card.code } }))?.balance).toBe(15000);

    const intent = await intents.create({
      orderId: order.id,
      method: 'card',
      amount: 75000,
      actor: 'web_checkout',
    });
    expect(intent.amount).toBe(75000);
    expect(intent.orderStatus).toBe('awaiting_payment');

    const paid = await intents.webhook({
      orderId: order.id,
      method: 'card',
      amount: 75000,
      txnId: intent.txnId,
      status: 'succeeded',
      actor: 'card',
    });
    expect(paid.order?.status).toBe('paid');
    expect(await prisma.deviceUnit.count({ where: { orderId: order.id, status: 'sold' } })).toBe(1);
  });

  it('deduplicates a gift-card retry by generated transaction id', async () => {
    const { order } = await reservedOrder(30000);
    const card = await giftcards.issue({ code: 'gc-retry', amount: 30000 }, 'cashier');
    const dto = { orderId: order.id, method: 'gift_card' as const, amount: 30000, giftCardCode: card.code };

    const first = await payments.pay(dto, 'cashier');
    const second = await payments.pay(dto, 'cashier');

    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(await prisma.payment.count({ where: { orderId: order.id, method: 'gift_card' } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'giftcard.redeemed' } })).toBe(1);
    expect(await prisma.giftCard.findUnique({ where: { code: card.code } })).toMatchObject({
      balance: 0,
      status: 'redeemed',
    });
  });

  it('rejects over-balance redemption without moving money or stock', async () => {
    const { order } = await reservedOrder(30000);
    const card = await giftcards.issue({ code: 'gc-low', amount: 10000 }, 'cashier');

    const err = await payments
      .pay({ orderId: order.id, method: 'gift_card', amount: 30000, giftCardCode: card.code }, 'cashier')
      .catch((e) => e);

    expect(err).toBeInstanceOf(ConflictError);
    expect(err.code).toBe('giftcard_insufficient_balance');
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
    expect((await prisma.giftCard.findUnique({ where: { code: card.code } }))?.balance).toBe(10000);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('reserved');
  });

  it('does not let a customer or guest capability spend a gift card on another customer order', async () => {
    const owner = await reservedOrder(30000);
    const attacker = await prisma.customer.create({
      data: { phone: `+9967055${(++seq).toString().padStart(4, '0')}`, name: 'Attacker' },
    });
    const card = await giftcards.issue({ code: 'gc-owner-bound', amount: 30000 }, 'cashier');

    await expect(payments.payForCustomer(attacker.id, {
      orderId: owner.order.id,
      method: 'gift_card',
      amount: 30000,
      giftCardCode: card.code,
    }, attacker.id)).rejects.toMatchObject({ code: 'order_not_found' });
    expect(await prisma.payment.count({ where: { orderId: owner.order.id } })).toBe(0);
    expect(await prisma.giftCard.findUnique({ where: { code: card.code } })).toMatchObject({ balance: 30000 });
  });

  it('is race-safe: two concurrent redemptions cannot over-draw one card', async () => {
    const a = await reservedOrder(30000);
    const b = await reservedOrder(30000);
    const card = await giftcards.issue({ code: 'gc-race', amount: 30000 }, 'cashier'); // covers only one

    const results = await Promise.allSettled([
      payments.pay({ orderId: a.order.id, method: 'gift_card', amount: 30000, giftCardCode: card.code }, 'cashier'),
      payments.pay({ orderId: b.order.id, method: 'gift_card', amount: 30000, giftCardCode: card.code }, 'cashier'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1); // exactly one wins
    const after = await prisma.giftCard.findUniqueOrThrow({ where: { code: card.code } });
    expect(after.balance).toBe(0); // never negative
    expect(after.status).toBe('redeemed');
    expect(await prisma.auditEvent.count({ where: { type: 'giftcard.redeemed' } })).toBe(1);
  });
});
