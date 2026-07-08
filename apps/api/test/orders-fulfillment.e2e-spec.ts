import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';

describe('Order fulfillment metadata', () => {
  let prisma: PrismaService;
  let orders: OrdersService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    orders = new OrdersService(prisma, new AuditService(prisma), new UnitsService(prisma));
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
      data: { phone: `+99670066${seq.toString().padStart(4, '0')}`, name: 'Pickup' },
    });
  }

  it('stores click-and-collect details and writes them to the Event Ledger', async () => {
    const c = await customer();
    const order = await orders.create(
      {
        customerId: c.id,
        channel: 'web',
        fulfillmentType: 'pickup',
        pickupPoint: 'alistore-center',
        deliverySlot: 'today 16:00-18:00',
        total: 100000,
        items: [{ sku: 'PICKUP-SKU', qty: 1, price: 100000 }],
      },
      'system',
    );

    expect(order).toMatchObject({
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'alistore-center',
      deliverySlot: 'today 16:00-18:00',
      deliveryAddress: null,
    });
    expect(order.pickupCode).toMatch(/^PU-[0-9A-F]{6}$/);

    const event = await prisma.auditEvent.findFirstOrThrow({ where: { type: 'order.created' } });
    expect(event.payload).toMatchObject({
      orderId: order.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'alistore-center',
      deliverySlot: 'today 16:00-18:00',
      pickupCode: order.pickupCode,
    });
  });

  it('defaults native staff sales to in-store fulfillment', async () => {
    const c = await customer();
    const order = await orders.create(
      {
        customerId: c.id,
        channel: 'staff_mobile',
        total: 120000,
        items: [{ sku: 'STAFF-MOBILE-SKU', qty: 1, price: 120000 }],
      },
      'staff',
    );

    expect(order.fulfillmentType).toBe('store');
    expect(order.pickupCode).toMatch(/^PU-[0-9A-F]{6}$/);
  });
});
