import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { ValidationError } from '../src/common/errors';

/**
 * F-15* — статус `reserved` ставит только резерв стока, не generic-переход.
 *
 * `created → reserved` — валидное ребро (POS/веб пропускают подтверждение), и
 * `reserve()`/`fulfill()` на него опираются. Но generic `transition()` гонял
 * тот же переход через `assertTransition`, НЕ вызывая `reserve()`, который
 * реально локает юниты/количество. Заказ помечался «зарезервирован» без стока —
 * и взрывался позже на `picking` (`order_reservation_incomplete`), когда чинить
 * уже поздно.
 *
 * Фикс — как у `paid`: ребро в state machine остаётся (его использует
 * `reserve()`), но generic `transition()` отказывает в `reserved`, отправляя на
 * резерв. Тест закрепляет: generic-путь не меняет статус и не трогает сток, а
 * штатный `fulfill()` по-прежнему резервирует.
 */
describe('F-15*: reserved достижим только через резерв стока', () => {
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
    await prisma.reservation.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function seed() {
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+99670008${seq.toString().padStart(4, '0')}`, name: 'Веб' },
    });
    const product = await prisma.product.create({
      data: { sku: `RSV-${seq}`, name: 'iPhone', price: 100000, cost: 80000, category: 'phones', attrs: {} },
    });
    await prisma.deviceUnit.create({
      data: { imei: `IMEI-RSV-${seq}`, productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
    });
    const order = await orders.create(
      { customerId: customer.id, channel: 'web', total: 100000, items: [{ sku: product.sku, qty: 1, price: 100000 }] },
      'system',
    );
    return { order, imei: `IMEI-RSV-${seq}` };
  }

  it('generic transition→reserved отклоняется и НЕ трогает сток', async () => {
    const { order, imei } = await seed();

    let caught: unknown;
    try {
      await orders.transition(order.id, 'reserved', 'staff');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).getStatus()).toBe(422);
    expect((caught as ValidationError).code).toBe('order_reserve_requires_service');

    // Статус не сдвинулся, юнит не залочен — «резерв» без стока не состоялся.
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after?.status).toBe('created');
    const unit = await prisma.deviceUnit.findUnique({ where: { imei } });
    expect(unit?.status).toBe('in_stock');
    expect(unit?.orderId).toBeNull();
  });

  it('штатный fulfill() по-прежнему резервирует и локает юнит', async () => {
    const { order, imei } = await seed();

    const res = await orders.fulfill(order.id, 'warehouse');
    expect(res.order.status).toBe('reserved');

    const unit = await prisma.deviceUnit.findUnique({ where: { imei } });
    expect(unit?.status).toBe('reserved');
    expect(unit?.orderId).toBe(order.id);
  });
});
