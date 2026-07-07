import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { ConflictError } from '../src/common/errors';

/**
 * Warehouse fulfillment: a web order arrives `created` with IMEI-less lines.
 * fulfill() assigns concrete in_stock units, normalizes qty>1 to one unit per
 * line, reserves them, and moves the order to `reserved`.
 */
describe('Warehouse fulfillment (integration)', () => {
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
    await prisma.reservation.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function seed(units: number) {
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+99670007${seq.toString().padStart(4, '0')}`, name: 'Веб' },
    });
    const product = await prisma.product.create({
      data: { sku: `WH-${seq}`, name: 'iPhone', price: 100000, cost: 80000, category: 'phones', attrs: {} },
    });
    for (let n = 0; n < units; n += 1) {
      await prisma.deviceUnit.create({
        data: { imei: `IMEI-WH-${seq}-${n}`, productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
      });
    }
    return { customer, product };
  }

  it('assigns a unit to a web order line and moves it to reserved', async () => {
    const { customer, product } = await seed(2);
    const order = await orders.create(
      { customerId: customer.id, channel: 'web', total: 100000, items: [{ sku: product.sku, qty: 1, price: 100000 }] },
      'system',
    );

    const res = await orders.fulfill(order.id, 'warehouse');
    expect(res.order.status).toBe('reserved');
    expect(res.assigned).toHaveLength(1);

    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    expect(item?.imei).toBe(res.assigned[0]);
    const unit = await prisma.deviceUnit.findUnique({ where: { imei: res.assigned[0] } });
    expect(unit?.status).toBe('reserved');
    expect(unit?.orderId).toBe(order.id);
  });

  it('normalizes a qty>1 line to one unit per line', async () => {
    const { customer, product } = await seed(3);
    const order = await orders.create(
      { customerId: customer.id, channel: 'web', total: 200000, items: [{ sku: product.sku, qty: 2, price: 100000 }] },
      'system',
    );

    const res = await orders.fulfill(order.id, 'warehouse');
    expect(res.assigned).toHaveLength(2);
    const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.imei && i.qty === 1)).toBe(true);
    const reserved = await prisma.deviceUnit.count({ where: { status: 'reserved' } });
    expect(reserved).toBe(2);
  });

  it('rejects fulfillment when stock is insufficient (409)', async () => {
    const { customer, product } = await seed(1);
    const order = await orders.create(
      { customerId: customer.id, channel: 'web', total: 300000, items: [{ sku: product.sku, qty: 3, price: 100000 }] },
      'system',
    );
    const err = await orders.fulfill(order.id, 'warehouse').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('insufficient_stock');
  });
});
