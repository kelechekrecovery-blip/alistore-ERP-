import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { ValidationError } from '../src/common/errors';

/**
 * `courier_assigned` ставит только создание рейса, не generic-переход.
 *
 * Ребро `packed → courier_assigned` валидно, но generic `transition()` пишет
 * ровно одно поле — `status`. `courierId` проставляет исключительно
 * `POST /courier/runs`. Заказ оказывался в `courier_assigned` с `courierId =
 * null`, и дальше не мог ничего:
 *   - `listMine` фильтрует по `courierId` — заказа не видел ни один курьер;
 *   - `createRun` требует `paid|packed` и отвечал `order_not_assignable`;
 *   - `startDelivery` матчит по `courierId` и не обновлял ни строки.
 * Единственным выходом оставалась отмена уже собранного заказа.
 *
 * Тот же приём, что у `reserved` и `paid`: ребро в state machine остаётся (его
 * использует создание рейса), а generic-переход отказывает и называет
 * правильную дверь.
 */
describe('courier_assigned достижим только через создание рейса', () => {
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

  async function seedPackedOrder() {
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+99670009${seq.toString().padStart(4, '0')}`, name: 'Курьерский' },
    });
    const product = await prisma.product.create({
      data: { sku: `CRA-${seq}`, name: 'iPhone', price: 100000, cost: 80000, category: 'phones', attrs: {} },
    });
    await prisma.deviceUnit.create({
      data: { imei: `IMEI-CRA-${seq}`, productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
    });
    const order = await orders.create(
      { customerId: customer.id, channel: 'web', total: 100000, paymentMode: 'cod', items: [{ sku: product.sku, qty: 1, price: 100000 }] },
      'system',
    );
    await orders.fulfill(order.id, 'warehouse');
    await orders.transition(order.id, 'picking', 'warehouse');
    await orders.transition(order.id, 'packed', 'warehouse');
    return order;
  }

  it('generic transition→courier_assigned отклоняется и не двигает заказ', async () => {
    const order = await seedPackedOrder();

    let caught: unknown;
    try {
      await orders.transition(order.id, 'courier_assigned', 'staff');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).getStatus()).toBe(422);
    expect((caught as ValidationError).code).toBe('order_courier_assign_requires_run');

    // Заказ остался собранным и назначаемым, а не повис без курьера.
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect({ status: after?.status, courierId: after?.courierId })
      .toEqual({ status: 'packed', courierId: null });
  });

  it('остальные переходы из packed по-прежнему работают', async () => {
    // Проверка, что запрет узкий: закрыт один статус, а не ветка целиком.
    const order = await seedPackedOrder();
    const moved = await orders.transition(order.id, 'ready_for_pickup', 'warehouse');
    expect(moved.status).toBe('ready_for_pickup');
  });
});
