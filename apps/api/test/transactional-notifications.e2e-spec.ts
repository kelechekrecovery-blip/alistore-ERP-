import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { WarrantyService } from '../src/warranty/warranty.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { LogNotificationTransport } from '../src/outbox/transports/log.transport';

/**
 * Transactional customer notifications: operational events enqueue templated
 * outbox messages only for customers who consented to contact, and the enqueue
 * happens in the same mutation transaction as the audited business change.
 */
describe('Transactional customer notifications (integration)', () => {
  let prisma: PrismaService;
  let orders: OrdersService;
  let warranty: WarrantyService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const outbox = new OutboxService(prisma, new LogNotificationTransport());
    orders = new OrdersService(prisma, audit, new UnitsService(prisma), outbox);
    warranty = new WarrantyService(prisma, audit, outbox);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.outboxMessage.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.warrantyCase.deleteMany();
    await prisma.debtPlan.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function customer(consent: boolean) {
    seq += 1;
    return prisma.customer.create({
      data: {
        phone: `+9967029${seq.toString().padStart(4, '0')}`,
        name: consent ? 'Consent' : 'Opt out',
        consent,
      },
    });
  }

  async function product() {
    seq += 1;
    return prisma.product.create({
      data: {
        sku: `TN-${seq}`,
        name: 'iPhone 15',
        price: 100000,
        cost: 80000,
        category: 'phones',
        attrs: {},
      },
    });
  }

  it('queues order templates only for consented customers', async () => {
    const optedIn = await customer(true);
    const optedOut = await customer(false);
    const item = await product();

    const created = await orders.create(
      {
        customerId: optedIn.id,
        channel: 'web',
        total: 100000,
        items: [{ sku: item.sku, qty: 1, price: 100000 }],
      },
      'web',
    );
    await orders.create(
      {
        customerId: optedOut.id,
        channel: 'web',
        total: 100000,
        items: [{ sku: item.sku, qty: 1, price: 100000 }],
      },
      'web',
    );
    const paid = await prisma.order.create({
      data: { customerId: optedIn.id, channel: 'pos', total: 50000, status: 'paid' },
    });
    await orders.transition(paid.id, 'ready_for_pickup', 'staff');

    const outbox = await prisma.outboxMessage.findMany({ orderBy: { createdAt: 'asc' } });
    expect(outbox.map((message) => message.template)).toEqual([
      'order_confirmed',
      'order_ready',
    ]);
    expect(outbox.map((message) => message.recipient)).toEqual([optedIn.phone, optedIn.phone]);
    expect(outbox[0].payload).toMatchObject({ customerId: optedIn.id, orderId: created.id });
    expect(outbox[1].payload).toMatchObject({ customerId: optedIn.id, orderId: paid.id });
  });

  it('queues warranty lifecycle templates only for consented customers', async () => {
    const optedIn = await customer(true);
    const optedOut = await customer(false);
    const item = await product();
    const imei = `TN-WR-${seq}`;
    const optedOutImei = `TN-WR-OUT-${seq}`;
    await prisma.deviceUnit.create({
      data: { imei, productId: item.id, status: 'sold', location: 'BISHKEK-1' },
    });
    await prisma.deviceUnit.create({
      data: { imei: optedOutImei, productId: item.id, status: 'sold', location: 'BISHKEK-1' },
    });

    const wc = await warranty.open(
      { imei, customerId: optedIn.id, problem: 'не включается' },
      'staff',
    );
    await warranty.transition(wc.id, 'rejected', 'staff');
    await warranty.open(
      { imei: optedOutImei, customerId: optedOut.id, problem: 'x' },
      'staff',
    );

    const outbox = await prisma.outboxMessage.findMany({ orderBy: { createdAt: 'asc' } });
    expect(outbox.map((message) => message.template)).toEqual([
      'warranty_created',
      'warranty_closed',
    ]);
    expect(outbox.map((message) => message.recipient)).toEqual([optedIn.phone, optedIn.phone]);
    expect(outbox[0].payload).toMatchObject({ customerId: optedIn.id, warrantyId: wc.id, imei });
    expect(outbox[1].payload).toMatchObject({ customerId: optedIn.id, warrantyId: wc.id, imei });
  });
});
