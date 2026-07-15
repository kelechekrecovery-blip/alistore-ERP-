import { PrismaService } from '../src/prisma/prisma.service';
import { AuditInput, AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { ConfigService } from '@nestjs/config';
import { ConflictError } from '../src/common/errors';
import { reconcileRefundLoyaltyOnTx } from '../src/customers/loyalty-ledger';
import { PromotionsService } from '../src/promotions/promotions.service';

/**
 * Personal account: listByCustomer returns only the caller's orders, newest first.
 * The HTTP guard (JwtAuthGuard) scopes customerId to the authenticated principal;
 * here we assert the query-level isolation the endpoint relies on.
 */
describe('Orders by customer (account)', () => {
  let prisma: PrismaService;
  let orders: OrdersService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    orders = new OrdersService(
      prisma,
      audit,
      new UnitsService(prisma),
      undefined,
      undefined,
      undefined,
      new PromotionsService(prisma, audit),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.loyaltyEntry.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.promotionRedemption.deleteMany();
    await prisma.promotionCode.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function customer() {
    seq += 1;
    return prisma.customer.create({
      data: { phone: `+99670008${seq.toString().padStart(4, '0')}`, name: 'Тест' },
    });
  }

  it('returns only the customer own orders', async () => {
    const a = await customer();
    const b = await customer();
    await orders.create(
      { customerId: a.id, channel: 'web', total: 100, items: [{ sku: 'X', qty: 1, price: 100 }] },
      'system',
    );
    await orders.create(
      { customerId: a.id, channel: 'web', total: 200, items: [{ sku: 'Y', qty: 1, price: 200 }] },
      'system',
    );
    await orders.create(
      { customerId: b.id, channel: 'web', total: 300, items: [{ sku: 'Z', qty: 1, price: 300 }] },
      'system',
    );

    const mine = await orders.listByCustomer(a.id);
    expect(mine).toHaveLength(2);
    expect(mine.every((o) => o.customerId === a.id)).toBe(true);
    // newest first
    expect(mine[0].createdAt >= mine[1].createdAt).toBe(true);
    expect(mine[0].items).toBeDefined();
  });

  it('returns the same order for a repeated native idempotency key', async () => {
    const owner = await customer();
    const input = {
      customerId: owner.id,
      channel: 'mobile' as const,
      total: 100,
      items: [{ sku: 'OFFLINE-1', qty: 1, price: 100 }],
    };

    const first = await orders.create(input, owner.id, 'native-order-retry-1');
    const replay = await orders.create(input, owner.id, 'native-order-retry-1');

    expect(replay.id).toBe(first.id);
    expect(await prisma.order.count({ where: { idempotencyKey: 'native-order-retry-1' } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'order.created', refs: { has: first.id } } })).toBe(1);
  });

  it('creates authenticated native orders from server prices and current stock', async () => {
    const owner = await customer();
    const product = await prisma.product.create({
      data: { sku: 'NATIVE-SERVER-PRICE', name: 'Native phone', price: 125000, cost: 100000, category: 'phones', attrs: {} },
    });
    await prisma.deviceUnit.createMany({
      data: [
        { imei: 'NATIVE-SERVER-1', productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
        { imei: 'NATIVE-SERVER-2', productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
      ],
    });

    const order = await orders.createFromCatalog({
      customerId: owner.id,
      channel: 'mobile',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: 2,
      items: [{ sku: product.sku, qty: 2, price: 1, imei: 'CLIENT-CANNOT-ASSIGN' }],
    }, owner.id, 'native-server-quote-1');

    expect(order.total).toBe(250000);
    expect(order.items).toEqual([expect.objectContaining({ sku: product.sku, qty: 2, price: 125000, imei: null })]);
    await prisma.deviceUnit.updateMany({ where: { productId: product.id }, data: { status: 'reserved' } });
    const replay = await orders.createFromCatalog({
      customerId: owner.id,
      channel: 'mobile',
      total: 1,
      items: [{ sku: product.sku, qty: 1, price: 1 }],
    }, owner.id, 'native-server-quote-1');
    expect(replay.id).toBe(order.id);
  });

  it('prices checkout on the server and redeems loyalty exactly once on replay', async () => {
    const owner = await customer();
    await prisma.loyaltyEntry.create({
      data: { customerId: owner.id, label: 'Стартовые бонусы', amount: 1000, sourceRef: 'loyalty-pricing-seed' },
    });
    const product = await prisma.product.create({
      data: { sku: 'LOYALTY-PRICE', name: 'Server priced phone', price: 10000, cost: 8000, category: 'phones', attrs: {} },
    });
    await prisma.deviceUnit.create({
      data: { imei: 'LOYALTY-PRICE-1', productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
    });
    await prisma.promotionCode.create({
      data: {
        code: 'ALI10',
        name: 'Managed test offer',
        status: 'active',
        discountType: 'fixed',
        discountValue: 3000,
        eligibleProductIds: [],
        eligibleCategories: [],
        createdBy: 'test',
        updatedBy: 'test',
      },
    });
    const input = {
      customerId: owner.id,
      channel: 'web' as const,
      fulfillmentType: 'courier' as const,
      deliveryAddress: 'Бишкек, Киевская 95',
      total: 1,
      promoCode: 'ali10',
      loyaltyPoints: 700,
      items: [{ sku: product.sku, qty: 1, price: 1 }],
    };

    const first = await orders.createFromCatalog(input, owner.id, 'loyalty-price-order', true);
    const replay = await orders.createFromCatalog(input, owner.id, 'loyalty-price-order', true);

    expect(replay.id).toBe(first.id);
    expect(first).toMatchObject({
      subtotal: 10000,
      deliveryFee: 200,
      promoCode: 'ALI10',
      promoDiscount: 3000,
      loyaltyRedeemed: 700,
      total: 6500,
    });
    expect(await prisma.loyaltyEntry.count({ where: { kind: 'redeem', orderId: first.id } })).toBe(1);
    const balance = await prisma.loyaltyEntry.aggregate({ where: { customerId: owner.id }, _sum: { amount: true } });
    expect(balance._sum.amount).toBe(300);
    expect(await prisma.auditEvent.count({ where: { type: 'loyalty.redeemed', refs: { has: first.id } } })).toBe(1);
  });

  it('serializes concurrent loyalty redemption for one customer', async () => {
    const owner = await customer();
    await prisma.loyaltyEntry.create({
      data: { customerId: owner.id, label: 'Баланс', amount: 1000, sourceRef: 'loyalty-race-seed' },
    });
    const product = await prisma.product.create({
      data: { sku: 'LOYALTY-RACE', name: 'Race phone', price: 5000, cost: 4000, category: 'phones', attrs: {} },
    });
    await prisma.deviceUnit.createMany({ data: [
      { imei: 'LOYALTY-RACE-1', productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
      { imei: 'LOYALTY-RACE-2', productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
    ] });
    const create = (key: string) => orders.createFromCatalog({
      customerId: owner.id,
      channel: 'mobile',
      total: 1,
      loyaltyPoints: 800,
      items: [{ sku: product.sku, qty: 1, price: 1 }],
    }, owner.id, key, true);

    const results = await Promise.allSettled([create('loyalty-race-a'), create('loyalty-race-b')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.loyaltyEntry.count({ where: { customerId: owner.id, kind: 'redeem' } })).toBe(1);
    const balance = await prisma.loyaltyEntry.aggregate({ where: { customerId: owner.id }, _sum: { amount: true } });
    expect(balance._sum.amount).toBe(200);
  });

  it('earns cashback only after reconciled completion and compensates a full refund', async () => {
    const owner = await customer();
    await prisma.loyaltyEntry.create({
      data: { customerId: owner.id, label: 'Баланс', amount: 1000, sourceRef: 'loyalty-refund-seed' },
    });
    const order = await orders.create(
      { customerId: owner.id, channel: 'web', total: 9000, items: [{ sku: 'LOYALTY-REFUND', qty: 1, price: 10000 }] },
      owner.id,
      undefined,
      { subtotal: 10000, deliveryFee: 0, promoCode: null, promoDiscount: 0, loyaltyPoints: 1000 },
    );
    await prisma.order.update({ where: { id: order.id }, data: { status: 'ready_for_pickup' } });
    const payment = await prisma.payment.create({
      data: { orderId: order.id, amount: 9000, method: 'card', status: 'received', txnId: 'loyalty-refund-payment' },
    });
    const completed = await orders.transition(order.id, 'completed', 'staff:test');
    expect(completed.loyaltyEarned).toBe(90);

    const refund = await prisma.payment.create({
      data: { orderId: order.id, amount: -9000, method: 'card', status: 'refunded', txnId: 'loyalty-refund-full' },
    });
    await new AuditService(prisma).transaction(async (tx) => {
      const events: AuditInput[] = [];
      await reconcileRefundLoyaltyOnTx(tx, {
        order: { ...completed, customerId: owner.id },
        refundPaymentId: refund.id,
        actor: 'staff:test',
      }, events);
      return { result: null, events };
    });

    expect(await prisma.loyaltyEntry.findUnique({ where: { sourceRef: `loyalty:earn:${order.id}` } })).toMatchObject({ amount: 90, paymentId: payment.id });
    expect(await prisma.loyaltyEntry.findUnique({ where: { sourceRef: `loyalty:refund-restore:${refund.id}` } })).toMatchObject({ amount: 1000 });
    expect(await prisma.loyaltyEntry.findUnique({ where: { sourceRef: `loyalty:refund-clawback:${refund.id}` } })).toMatchObject({ amount: -90 });
  });

  it('fulfills a fully loyalty-funded order without a synthetic payment', async () => {
    const owner = await customer();
    await prisma.loyaltyEntry.create({
      data: { customerId: owner.id, label: 'Баланс', amount: 5000, sourceRef: 'loyalty-zero-seed' },
    });
    const product = await prisma.product.create({
      data: { sku: 'LOYALTY-ZERO', name: 'Bonus phone', price: 5000, cost: 4000, category: 'phones', attrs: {} },
    });
    await prisma.deviceUnit.create({
      data: { imei: 'LOYALTY-ZERO-1', productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
    });
    const order = await orders.createFromCatalog({
      customerId: owner.id,
      channel: 'web',
      total: 1,
      loyaltyPoints: 5000,
      items: [{ sku: product.sku, qty: 1, price: 1 }],
    }, owner.id, 'loyalty-zero-order', true);

    expect(order.total).toBe(0);
    const fulfilled = await orders.fulfill(order.id, 'staff:test');
    expect(fulfilled.order.status).toBe('paid');
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.deviceUnit.findUniqueOrThrow({ where: { imei: 'LOYALTY-ZERO-1' } })).toMatchObject({ status: 'sold', orderId: order.id });
    expect(await prisma.auditEvent.count({ where: { type: 'order.paid', refs: { has: order.id } } })).toBe(1);
  });

  it('rejects native checkout when catalog stock is insufficient', async () => {
    const owner = await customer();
    const product = await prisma.product.create({
      data: { sku: 'NATIVE-LOW-STOCK', name: 'One phone', price: 90000, cost: 70000, category: 'phones', attrs: {} },
    });
    await prisma.deviceUnit.create({ data: { imei: 'NATIVE-LOW-1', productId: product.id, status: 'in_stock', location: 'BISHKEK-1' } });

    await expect(orders.createFromCatalog({
      customerId: owner.id,
      channel: 'mobile',
      total: 1,
      items: [{ sku: product.sku, qty: 2, price: 1 }],
    }, owner.id, 'native-low-stock-1')).rejects.toMatchObject({ code: 'insufficient_stock' });
  });

  it('does not expose an idempotent order to another customer', async () => {
    const owner = await customer();
    const attacker = await customer();
    const key = 'native-order-owner-scope-1';
    const input = {
      customerId: owner.id,
      channel: 'mobile' as const,
      total: 100,
      items: [{ sku: 'OFFLINE-2', qty: 1, price: 100 }],
    };
    await orders.create(input, owner.id, key);

    await expect(
      orders.create({ ...input, customerId: attacker.id }, attacker.id, key),
    ).rejects.toMatchObject({ code: 'order_idempotency_owner_mismatch' });
  });

  it('marks demo orders server-side and blocks operational transitions', async () => {
    const demoOrders = new OrdersService(
      prisma,
      new AuditService(prisma),
      new UnitsService(prisma),
      undefined,
      new ConfigService({ PUBLIC_DEMO_MODE: 'true' }),
    );
    const owner = await customer();
    const order = await demoOrders.create(
      { customerId: owner.id, channel: 'web', total: 100, items: [{ sku: 'DEMO', qty: 1, price: 100 }] },
      'demo:web',
    );

    expect(order.isDemo).toBe(true);
    await expect(demoOrders.transition(order.id, 'confirmed', 'staff:test')).rejects.toMatchObject({
      code: 'demo_order_read_only',
    } satisfies Partial<ConflictError>);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('created');
  });
});
