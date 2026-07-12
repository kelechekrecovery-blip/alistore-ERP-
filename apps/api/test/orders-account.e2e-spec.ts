import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';

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
});
