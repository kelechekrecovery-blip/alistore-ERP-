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
import { ReservationsService } from '../src/reservations/reservations.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { LogNotificationTransport } from '../src/outbox/transports/log.transport';

const RUN = `${process.pid}-${Date.now()}`;

describe('Product bundles (integration)', () => {
  let prisma: PrismaService;
  let products: ProductsService;
  let orders: OrdersService;
  let pos: PosService;
  let payments: PaymentsService;
  let approvals: ApprovalsService;
  let reservations: ReservationsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    approvals = new ApprovalsService(prisma, audit);
    const units = new UnitsService(prisma);
    orders = new OrdersService(prisma, audit, units);
    reservations = new ReservationsService(
      prisma,
      audit,
      units,
      new OutboxService(prisma, new LogNotificationTransport()),
    );
    products = new ProductsService(prisma, audit, approvals);
    payments = new PaymentsService(prisma, audit, units, approvals);
    pos = new PosService(
      prisma,
      new CustomersService(prisma, audit),
      new ShiftsService(prisma, audit),
      units,
      orders,
      payments,
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
    await prisma.consignmentItem.deleteMany();
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
      clientSaleId: `bundle-sale-replay-${RUN}-${seq}`,
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

  it('uses concrete serialized component costs when approving bundle margin', async () => {
    const seeded = await bundle(1, 2);
    await prisma.deviceUnit.updateMany({
      where: { productId: seeded.phone.id },
      data: { acquisitionCost: 65000 },
    });
    await prisma.deviceUnit.updateMany({
      where: { productId: seeded.accessory.id },
      data: { acquisitionCost: 10000 },
    });

    const parked = await pos.sale({
      staffId: 'bundle-margin-cashier',
      point: 'BISHKEK-1',
      method: 'cash',
      lines: [{ productId: seeded.product.id, sku: seeded.product.sku, price: 70000, qty: 1 }],
    });

    expect(parked).toMatchObject({
      pendingApproval: true,
      reason: 'margin',
      margin: { worstMargin: -15000, breaches: [{ cost: 85000, margin: -15000 }] },
    });
    expect(await prisma.order.count()).toBe(0);
  });

  it('cancels the POS order when preselected bundle stock disappears before fulfillment', async () => {
    const seeded = await bundle(1, 2);
    const fulfill = orders.fulfill.bind(orders);
    jest.spyOn(orders, 'fulfill').mockImplementationOnce(async (orderId, actor) => {
      await prisma.deviceUnit.deleteMany({ where: { productId: seeded.phone.id } });
      return fulfill(orderId, actor);
    });

    await expect(pos.sale({
      staffId: 'bundle-race-cashier',
      point: 'BISHKEK-1',
      method: 'cash',
      clientSaleId: `bundle-race-${RUN}-${seq}`,
      lines: [{ productId: seeded.product.id, sku: seeded.product.sku, price: 70000, qty: 1 }],
    })).rejects.toMatchObject({ code: 'insufficient_bundle_stock' });

    expect(await prisma.order.findFirstOrThrow({ where: { channel: 'pos' } })).toMatchObject({ status: 'cancelled' });
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.orderBundleAllocation.count()).toBe(0);
  });

  it('completes and deduplicates an approved zero-total bundle without a synthetic payment', async () => {
    const seeded = await bundle(1, 2);
    const dto = {
      staffId: 'bundle-free-cashier',
      point: 'BISHKEK-1',
      method: 'cash' as const,
      discountPct: 100,
      clientSaleId: `bundle-free-${RUN}-${seq}`,
      lines: [{ productId: seeded.product.id, sku: seeded.product.sku, price: 70000, qty: 1 }],
    };
    const parked = await pos.sale(dto);
    if (!parked.pendingApproval) throw new Error('zero-total bundle should require approval');
    await approvals.decide(parked.approvalId, { status: 'approved', approver: 'bundle-owner', approverRole: 'owner' });

    const first = await pos.sale({ ...dto, approvalId: parked.approvalId });
    const replay = await pos.sale({ ...dto, approvalId: parked.approvalId });

    expect(first).toMatchObject({ pendingApproval: false, total: 0, status: 'paid' });
    expect(replay).toMatchObject({ pendingApproval: false, orderId: first.orderId, total: 0, status: 'paid', shiftId: first.shiftId, idempotent: true });
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold', orderId: first.orderId } })).toBe(3);
    expect(await prisma.orderBundleAllocation.count({ where: { orderId: first.orderId, active: false, consumedAt: { not: null } } })).toBe(3);
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

  it('does not assign serialized consignment stock to a bundle without component pricing', async () => {
    const seeded = await bundle(1, 2);
    const phoneUnit = await prisma.deviceUnit.findFirstOrThrow({ where: { productId: seeded.phone.id } });
    await prisma.consignmentItem.create({
      data: {
        idempotencyKey: `bundle-consignment-${seq}`,
        unitId: phoneUnit.id,
        productId: seeded.phone.id,
        ownerName: 'Bundle owner',
        commissionBps: 1000,
        createdBy: 'warehouse',
      },
    });
    const customer = await prisma.customer.create({ data: { phone: '+996700801008', name: 'Bundle consignment' } });
    const order = await orders.createFromCatalog({
      customerId: customer.id,
      channel: 'web',
      total: seeded.product.price,
      items: [{ sku: seeded.product.sku, qty: 1, price: seeded.product.price }],
    }, customer.id);

    await expect(orders.fulfill(order.id, 'warehouse-consignment-bundle')).rejects.toMatchObject({
      code: 'insufficient_bundle_stock',
    });
    expect(await prisma.orderBundleAllocation.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.reservation.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.deviceUnit.findUniqueOrThrow({ where: { id: phoneUnit.id } })).toMatchObject({ status: 'in_stock' });
  });

  it('blocks bundle composition changes while an order is in flight', async () => {
    const seeded = await bundle(1, 2);
    const customer = await prisma.customer.create({ data: { phone: '+996700801003', name: 'Bundle C' } });
    const order = await orders.createFromCatalog({
      customerId: customer.id,
      channel: 'web',
      total: 1,
      items: [{ sku: seeded.product.sku, qty: 1, price: 1 }],
    }, customer.id);
    await orders.fulfill(order.id, 'warehouse-c');

    await expect(products.update(seeded.product.id, {
      bundleComponents: [{ sku: seeded.phone.sku, qty: 1 }],
    }, 'owner-bundle-test')).rejects.toMatchObject({ code: 'bundle_composition_in_flight' });
  });

  it('fulfills the immutable bundle snapshot when catalog composition changes concurrently', async () => {
    const seeded = await bundle(1, 2);
    const customer = await prisma.customer.create({ data: { phone: '+996700801004', name: 'Bundle snapshot' } });
    const order = await orders.createFromCatalog({
      customerId: customer.id,
      channel: 'web',
      total: 1,
      items: [{ sku: seeded.product.sku, qty: 1, price: 1 }],
    }, customer.id);

    // Simulate a catalog transaction that committed after pricing but before
    // fulfillment. The order remains bound to the composition it purchased.
    await prisma.productBundleComponent.deleteMany({ where: { bundleProductId: seeded.product.id } });
    await prisma.productBundleComponent.create({
      data: { bundleProductId: seeded.product.id, componentProductId: seeded.phone.id, qty: 1 },
    });

    await orders.fulfill(order.id, 'warehouse-snapshot');
    const allocations = await prisma.orderBundleAllocation.findMany({
      where: { orderId: order.id, active: true },
      orderBy: { componentSku: 'asc' },
    });
    expect(allocations).toHaveLength(3);
    expect(allocations.filter((allocation) => allocation.componentProductId === seeded.phone.id)).toHaveLength(1);
    expect(allocations.filter((allocation) => allocation.componentProductId === seeded.accessory.id)).toHaveLength(2);
  });

  it('fails closed when a stored inventory snapshot is malformed', async () => {
    const seeded = await bundle(1, 2);
    const customer = await prisma.customer.create({ data: { phone: '+996700801006', name: 'Bundle corrupt' } });
    const order = await orders.createFromCatalog({
      customerId: customer.id,
      channel: 'web',
      total: 1,
      items: [{ sku: seeded.product.sku, qty: 1, price: 1 }],
    }, customer.id);
    await prisma.orderItem.updateMany({
      where: { orderId: order.id },
      data: { inventorySnapshot: { corrupt: true } },
    });

    await expect(orders.fulfill(order.id, 'warehouse-corrupt')).rejects.toMatchObject({
      code: 'order_inventory_snapshot_invalid',
    });
    expect(await prisma.reservation.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('rejects a preassigned IMEI from a different snapshot product', async () => {
    const expected = await component('SERIAL-EXPECTED', 1, 40000);
    const wrong = await component('SERIAL-WRONG', 1, 41000);
    const wrongUnit = await prisma.deviceUnit.findFirstOrThrow({ where: { productId: wrong.id } });
    const customer = await prisma.customer.create({ data: { phone: '+996700801007', name: 'IMEI mismatch' } });
    const order = await orders.createFromCatalog({
      customerId: customer.id,
      channel: 'web',
      total: expected.price,
      items: [{ sku: expected.sku, qty: 1, price: expected.price }],
    }, customer.id);
    await prisma.orderItem.updateMany({
      where: { orderId: order.id },
      data: { imei: wrongUnit.imei },
    });

    await expect(orders.fulfill(order.id, 'warehouse-imei-mismatch')).rejects.toMatchObject({
      code: 'unit_product_mismatch',
    });
    expect(await prisma.reservation.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.deviceUnit.findUniqueOrThrow({ where: { imei: wrongUnit.imei } })).toMatchObject({
      productId: wrong.id,
      status: 'in_stock',
      orderId: null,
    });
  });

  it('rejects a bundle allocation whose physical unit belongs to another component', async () => {
    const seeded = await bundle(1, 2);
    const customer = await prisma.customer.create({ data: { phone: '+996700801008', name: 'Bundle IMEI mismatch' } });
    const order = await orders.createFromCatalog({
      customerId: customer.id,
      channel: 'web',
      total: seeded.product.price,
      items: [{ sku: seeded.product.sku, qty: 1, price: seeded.product.price }],
    }, customer.id);
    await orders.fulfill(order.id, 'warehouse-bundle-imei-mismatch');
    const phoneAllocation = await prisma.orderBundleAllocation.findFirstOrThrow({
      where: { orderId: order.id, componentProductId: seeded.phone.id },
    });
    await prisma.deviceUnit.update({
      where: { imei: phoneAllocation.imei },
      data: { productId: seeded.accessory.id },
    });

    await expect(payments.pay({
      orderId: order.id,
      amount: seeded.product.price,
      method: 'card',
      txnId: `bundle-mismatch-${seq}`,
    }, 'cashier-bundle-mismatch')).rejects.toMatchObject({ code: 'order_reservation_incomplete' });
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('preserves released bundle allocation history and safely reserves the same units again', async () => {
    const seeded = await bundle(1, 2);
    const customer = await prisma.customer.create({ data: { phone: '+996700801005', name: 'Bundle retry' } });
    const order = await orders.createFromCatalog({
      customerId: customer.id,
      channel: 'web',
      total: 1,
      items: [{ sku: seeded.product.sku, qty: 1, price: 1 }],
    }, customer.id);
    await orders.fulfill(order.id, 'warehouse-expiry');
    await prisma.reservation.updateMany({
      where: { orderId: order.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await reservations.releaseExpired()).released).toBe(3);
    expect(await prisma.orderBundleAllocation.count({
      where: { orderId: order.id, active: false, releasedAt: { not: null } },
    })).toBe(3);

    await orders.fulfill(order.id, 'warehouse-expiry-retry');
    expect(await prisma.orderBundleAllocation.count({ where: { orderId: order.id } })).toBe(6);
    expect(await prisma.orderBundleAllocation.count({ where: { orderId: order.id, active: true } })).toBe(3);
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
