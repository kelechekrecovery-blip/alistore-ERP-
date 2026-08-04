import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { ConflictError } from '../src/common/errors';

/**
 * Invariant #2 under concurrency: one IMEI cannot be reserved by two orders at
 * once. The conditional UPDATE (status predicate) is what makes this hold — the
 * old findUnique→update let both racers pass the check and double-reserve.
 */
describe('Concurrency: no double reservation of one IMEI (invariant #2)', () => {
  let prisma: PrismaService;
  let units: UnitsService;
  let orders: OrdersService;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    units = new UnitsService(prisma);
    orders = new OrdersService(prisma, audit, units);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('two parallel reservations of the same IMEI → exactly one succeeds', async () => {
    const customer = await prisma.customer.create({
      data: { phone: `+996${RUN}`, name: 'Гонка Клиент' },
    });
    const product = await prisma.product.create({
      data: {
        sku: `SKU-CC-${RUN}`,
        name: 'iPhone 15',
        price: 100000,
        cost: 80000,
        category: 'phones',
        attrs: {},
      },
    });
    const imei = `IMEI-CC-${RUN}`;
    await units.receive({ imei, productId: product.id, location: 'BISHKEK-1' });

    const makeOrder = () =>
      orders.create(
        {
          customerId: customer.id,
          channel: 'web',
          total: 100000,
          items: [{ sku: product.sku, qty: 1, price: 100000, imei }],
        },
        'seller',
      );
    const [o1, o2] = [await makeOrder(), await makeOrder()];

    const results = await Promise.allSettled([
      orders.reserve(o1.id, 'seller'),
      orders.reserve(o2.id, 'seller'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1); // exactly one racer wins
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictError,
    );

    // The unit is reserved for exactly one order.
    const unit = await prisma.deviceUnit.findUnique({ where: { imei } });
    expect(unit?.status).toBe('reserved');
  });
});
