import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { ConfigService } from '@nestjs/config';
import { ConflictError } from '../src/common/errors';

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
    orders = new OrdersService(prisma, audit, new UnitsService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
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
