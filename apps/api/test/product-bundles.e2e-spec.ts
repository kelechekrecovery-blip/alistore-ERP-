import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ProductsService } from '../src/products/products.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { CustomersService } from '../src/customers/customers.service';
import { ShiftsService } from '../src/shifts/shifts.service';
import { PosService } from '../src/pos/pos.service';

describe('Product bundles (integration)', () => {
  let prisma: PrismaService;
  let products: ProductsService;
  let orders: OrdersService;
  let pos: PosService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const approvals = new ApprovalsService(prisma, audit);
    const units = new UnitsService(prisma);
    orders = new OrdersService(prisma, audit, units);
    products = new ProductsService(prisma, audit, approvals);
    pos = new PosService(
      prisma,
      new CustomersService(prisma, audit),
      new ShiftsService(prisma, audit),
      units,
      orders,
      new PaymentsService(prisma, audit, units, approvals),
      approvals,
    );
  });

  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  beforeEach(() => clean());

  async function clean() {
    await prisma.auditEvent.deleteMany();
    await prisma.orderBundleAllocation.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.productBundleComponent.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  }

  async function component(label: string, unitCount: number, cost: number) {
    seq += 1;
    const product = await prisma.product.create({
      data: {
        sku: `${label}-${seq}`,
        name: `${label} component`,
        price: cost + 1000,
        cost,
        category: 'components',
        attrs: {},
      },
    });
    for (let index = 0; index < unitCount; index += 1) {
      await prisma.deviceUnit.create({
        data: {
          imei: `${label}-${seq}-IMEI-${index}`,
          productId: product.id,
          location: 'BISHKEK-1',
        },
      });
    }
    return product;
  }

  async function bundle(phoneUnits = 2, caseUnits = 4) {
    const phone = await component('BUNDLE-PHONE', phoneUnits, 40000);
    const accessory = await component('BUNDLE-CASE', caseUnits, 5000);
    const product = await products.create({
      sku: `BUNDLE-${++seq}`,
      name: 'Starter bundle',
      price: 70000,
      cost: 0,
      category: 'bundles',
      attrs: { description: 'Phone with two accessories' },
      bundleComponents: [
        { sku: phone.sku, qty: 1 },
        { sku: accessory.sku, qty: 2 },
      ],
    }, 'owner-bundle-test');
    return { phone, accessory, product };
  }

  it('derives bundle availability from component stock and exposes composition', async () => {
    const seeded = await bundle(2, 5);
    const listed = await products.list({ q: seeded.product.sku, limit: 50, offset: 0 });

    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({
      sku: seeded.product.sku,
      availableUnits: 2,
      bundleComponents: expect.arrayContaining([
        expect.objectContaining({ sku: seeded.phone.sku, qty: 1 }),
        expect.objectContaining({ sku: seeded.accessory.sku, qty: 2 }),
      ]),
    });
    expect(await prisma.auditEvent.count({ where: { type: 'product.created' } })).toBe(1);
  });

  it('sells every component atomically through POS and deduplicates replay', async () => {
    const seeded = await bundle(1, 2);
    const dto = {
      staffId: 'bundle-cashier',
      point: 'BISHKEK-1',
      method: 'cash' as const,
      clientSaleId: 'bundle-sale-replay-1',
      lines: [{ productId: seeded.product.id, sku: seeded.product.sku, price: 70000, qty: 1 }],
    };

    const first = await pos.sale(dto);
    const replay = await pos.sale(dto);
    if (first.pendingApproval || replay.pendingApproval) throw new Error('bundle sale unexpectedly parked');

    expect(replay.orderId).toBe(first.orderId);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.orderItem.count({ where: { orderId: first.orderId } })).toBe(1);
    expect(await prisma.orderBundleAllocation.count({ where: { orderId: first.orderId } })).toBe(3);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold', orderId: first.orderId } })).toBe(3);
    expect(await prisma.payment.count({ where: { orderId: first.orderId } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'unit.sold', refs: { has: first.orderId } } })).toBe(3);
  });

  it('allows only one concurrent fulfillment to claim the final component set', async () => {
    const seeded = await bundle(1, 2);
    const customers = await Promise.all([
      prisma.customer.create({ data: { phone: '+996700801001', name: 'Bundle A' } }),
      prisma.customer.create({ data: { phone: '+996700801002', name: 'Bundle B' } }),
    ]);
    const create = (customerId: string) => orders.createFromCatalog({
      customerId,
      channel: 'web',
      total: 1,
      items: [{ sku: seeded.product.sku, qty: 1, price: 1 }],
    }, customerId);
    const [first, second] = await Promise.all(customers.map((customer) => create(customer.id)));

    const results = await Promise.allSettled([
      orders.fulfill(first.id, 'warehouse-a'),
      orders.fulfill(second.id, 'warehouse-b'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.orderBundleAllocation.count()).toBe(3);
    expect(await prisma.deviceUnit.count({ where: { status: 'reserved' } })).toBe(3);
  });

  it('rejects virtual bundles that would create direct or nested stock', async () => {
    const stocked = await component('STOCKED-BUNDLE', 1, 1000);
    const spare = await component('BUNDLE-SPARE', 0, 500);
    await expect(products.update(stocked.id, {
      bundleComponents: [{ sku: spare.sku, qty: 1 }],
    }, 'owner-bundle-test')).rejects.toMatchObject({ code: 'bundle_has_direct_stock' });

    const seeded = await bundle(0, 0);
    await expect(products.update(seeded.phone.id, {
      bundleComponents: [{ sku: spare.sku, qty: 1 }],
    }, 'owner-bundle-test')).rejects.toMatchObject({ code: 'bundle_component_in_use' });
  });
});
