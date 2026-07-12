import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { ReservationsService } from '../src/reservations/reservations.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { LogNotificationTransport } from '../src/outbox/transports/log.transport';

/**
 * Business Invariant #7 (integration, real Postgres transaction):
 *   «Каждый reservation имеет expiresAt; истёкшие освобождаются.»
 * Verifies the release logic directly — no pg-boss needed; the scheduler is only
 * the durable trigger for ReservationsService.releaseExpired().
 */
describe('Reservation expiry sweep (invariant #7)', () => {
  let prisma: PrismaService;
  let orders: OrdersService;
  let units: UnitsService;
  let reservations: ReservationsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    units = new UnitsService(prisma);
    orders = new OrdersService(prisma, audit, units);
    const outbox = new OutboxService(prisma, new LogNotificationTransport());
    reservations = new ReservationsService(prisma, audit, units, outbox);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.outboxMessage.deleteMany();
    await prisma.auditEvent.deleteMany();
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

  async function seedReservedOrder(imei: string, consent = true) {
    seq += 1;
    const suffix = seq.toString().padStart(3, '0');
    const customer = await prisma.customer.create({
      data: { phone: `+9967100${suffix}`, name: 'Тест Клиент', consent },
    });
    const product = await prisma.product.create({
      data: {
        sku: `SKU-EXP-${suffix}`,
        name: 'iPhone 15',
        price: 100000,
        cost: 80000,
        category: 'phones',
        attrs: {},
      },
    });
    await units.receive({ imei, productId: product.id, location: 'BISHKEK-1' });
    const order = await orders.create(
      {
        customerId: customer.id,
        channel: 'web',
        total: 100000,
        items: [{ sku: product.sku, qty: 1, price: 100000, imei }],
      },
      'seller',
    );
    await orders.reserve(order.id, 'seller');
    return order;
  }

  it('releases an expired reservation: unit back to in_stock + ledger events', async () => {
    const imei = `IMEI-EXP-${seq + 1}`;
    const order = await seedReservedOrder(imei);
    expect((await prisma.deviceUnit.findUnique({ where: { imei } }))?.status).toBe(
      'reserved',
    );

    // Force the hold to have expired.
    await prisma.reservation.updateMany({
      where: { orderId: order.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const { released } = await reservations.releaseExpired();
    expect(released).toBe(1);

    const unit = await prisma.deviceUnit.findUnique({ where: { imei } });
    expect(unit?.status).toBe('in_stock');
    expect(unit?.orderId).toBeNull();

    const reservation = await prisma.reservation.findFirst({
      where: { orderId: order.id },
    });
    expect(reservation?.active).toBe(false);

    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining(['stock.released', 'reservation.expired']),
    );

    // A customer notification was enqueued transactionally with the release.
    const notice = await prisma.outboxMessage.findFirst({
      where: { template: 'reservation_expired' },
    });
    expect(notice).not.toBeNull();
    expect(notice?.status).toBe('pending');
  });

  it('does not touch a still-valid reservation', async () => {
    const imei = `IMEI-VALID-${seq + 1}`;
    await seedReservedOrder(imei); // fresh hold, ~30 min TTL

    const { released } = await reservations.releaseExpired();
    expect(released).toBe(0);
    expect((await prisma.deviceUnit.findUnique({ where: { imei } }))?.status).toBe(
      'reserved',
    );
    expect(await prisma.outboxMessage.count()).toBe(0); // no release → no notice
  });

  it('releases opted-out reservations without queuing a customer notice', async () => {
    const imei = `IMEI-OPTOUT-${seq + 1}`;
    const order = await seedReservedOrder(imei, false);
    await prisma.reservation.updateMany({
      where: { orderId: order.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await reservations.releaseExpired()).released).toBe(1);
    expect((await prisma.deviceUnit.findUnique({ where: { imei } }))?.status).toBe(
      'in_stock',
    );
    expect(await prisma.outboxMessage.count()).toBe(0);
  });

  it('is idempotent — a second sweep releases nothing more', async () => {
    const imei = `IMEI-IDEM-${seq + 1}`;
    const order = await seedReservedOrder(imei);
    await prisma.reservation.updateMany({
      where: { orderId: order.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await reservations.releaseExpired()).released).toBe(1);
    expect((await reservations.releaseExpired()).released).toBe(0);
  });
});
