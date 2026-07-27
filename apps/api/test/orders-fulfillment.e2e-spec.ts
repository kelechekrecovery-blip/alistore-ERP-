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
      pickupPoint: 'AliStore Центр',
      deliverySlot: 'today 16:00-18:00',
      deliveryAddress: null,
      taxBaseAmount: 89_286,
      taxAmount: 10_714,
    });
    expect(order.items).toMatchObject([{ lineNumber: 1, discountAmount: 0, taxCode: 'vat_standard', taxRateBps: 1200, taxBaseAmount: 89_286, taxAmount: 10_714 }]);
    expect(order.pickupCode).toMatch(/^PU-[0-9A-F]{6}$/);

    const event = await prisma.auditEvent.findFirstOrThrow({ where: { type: 'order.created' } });
    expect(event.payload).toMatchObject({
      orderId: order.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'AliStore Центр',
      deliverySlot: 'today 16:00-18:00',
      pickupCode: order.pickupCode,
      taxBaseAmount: 89_286,
      taxAmount: 10_714,
    });
  });

  // F-07 — «fulfillmentType необязателен» не воспроизводится как дыра.
  //
  // Находка предлагала сделать поле обязательным (@IsNotEmpty). Это сломало бы
  // ровно то поведение, что закреплено тестом «defaults native staff sales to
  // in-store» ниже, и не закрыло бы ничего: публичный вход `createFromCatalog`
  // не создаёт курьерский заказ без адреса — он падает на нём. Пропуск поля не
  // «просачивает» заказ.
  //
  // Тест намеренно бьёт по `createFromCatalog` (то, что вызывает контроллер для
  // покупателя и гостя — `orders.controller.ts:69,204`), а не по низкоуровневому
  // `create`, который исполняет уже проверенный dto. Проверка адреса
  // (`orders.service.ts:177`) безусловна и не зависит от того, подключён ли
  // logistics-сервис.
  it('F-07: courier без адреса доставки отклоняется на публичном входе', async () => {
    const c = await customer();
    await expect(
      orders.createFromCatalog(
        {
          customerId: c.id,
          channel: 'web',
          fulfillmentType: 'courier',
          total: 100000,
          items: [{ sku: 'COURIER-SKU', qty: 1, price: 100000 }],
        },
        'system',
      ),
    ).rejects.toMatchObject({ code: 'delivery_address_required' });
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
