import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { ConflictError } from '../src/common/errors';

/**
 * P0 acceptance tests (🔴) from «AliStore QA Test Scenarios», enforced end-to-end
 * against a real Postgres transaction:
 *   1. двойная продажа IMEI  → 409
 *   2. оплата без резерва     → 409
 * Plus a happy-path check that the Event Ledger records the full trail.
 */
describe('Business invariants (integration)', () => {
  let prisma: PrismaService;
  let orders: OrdersService;
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
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // wipe in FK-safe order
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

  async function seedProduct() {
    seq += 1;
    const suffix = seq.toString().padStart(3, '0');
    const customer = await prisma.customer.create({
      data: { phone: `+9967000${suffix}`, name: 'Тест Клиент' },
    });
    const product = await prisma.product.create({
      data: {
        sku: `SKU-${suffix}`,
        name: 'iPhone 15',
        price: 100000,
        cost: 80000,
        category: 'phones',
        attrs: {},
      },
    });
    return { customer, product };
  }

  it('rejects a second sale of the same IMEI with 409', async () => {
    const { customer, product } = await seedProduct();
    const imei = `IMEI-A-${seq}`;
    await units.receive({ imei, productId: product.id, location: 'BISHKEK-1' });

    const o1 = await orders.create(
      {
        customerId: customer.id,
        channel: 'pos',
        total: 100000,
        items: [{ sku: product.sku, qty: 1, price: 100000, imei }],
      },
      'seller',
    );
    await orders.reserve(o1.id, 'seller');
    await payments.pay(
      { orderId: o1.id, method: 'card', amount: 100000, txnId: 'invariant-sale-a' },
      'cashier',
    );

    const sold = await prisma.deviceUnit.findUnique({ where: { imei } });
    expect(sold?.status).toBe('sold');

    // A second order for the same IMEI must fail at reservation.
    const o2 = await orders.create(
      {
        customerId: customer.id,
        channel: 'pos',
        total: 100000,
        items: [{ sku: product.sku, qty: 1, price: 100000, imei }],
      },
      'seller',
    );
    const err = await orders.reserve(o2.id, 'seller').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('unit_not_available');
  });

  it('rejects payment when the order was never reserved with 409', async () => {
    const { customer, product } = await seedProduct();
    const imei = `IMEI-B-${seq}`;
    await units.receive({ imei, productId: product.id, location: 'BISHKEK-1' });

    const order = await orders.create(
      {
        customerId: customer.id,
        channel: 'web',
        total: 50000,
        items: [{ sku: product.sku, qty: 1, price: 50000, imei }],
      },
      'seller',
    );

    const err = await payments
      .pay({ orderId: order.id, method: 'cash', amount: 50000, txnId: 'invariant-unreserved' }, 'cashier')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('payment_without_reservation');

    // Nothing was sold; the unit stays in stock.
    const unit = await prisma.deviceUnit.findUnique({ where: { imei } });
    expect(unit?.status).toBe('in_stock');
  });

  it('records the full Event Ledger trail for created→reserved→paid', async () => {
    const { customer, product } = await seedProduct();
    const imei = `IMEI-C-${seq}`;
    await units.receive({ imei, productId: product.id, location: 'BISHKEK-1' });

    const order = await orders.create(
      {
        customerId: customer.id,
        channel: 'pos',
        total: 100000,
        items: [{ sku: product.sku, qty: 1, price: 100000, imei }],
      },
      'seller',
    );
    await orders.reserve(order.id, 'seller');
    await payments.pay(
      { orderId: order.id, method: 'card', amount: 100000, txnId: 'invariant-sale-b' },
      'cashier',
    );

    const events = await prisma.auditEvent.findMany({ orderBy: { ts: 'asc' } });
    const types = events.map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'order.created',
        'stock.reserved',
        'order.reserved',
        'payment.received',
        'unit.sold',
        'order.paid',
      ]),
    );
  });
});
