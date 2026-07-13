import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { CourierService } from '../src/courier/courier.service';
import { ConflictError, ValidationError } from '../src/common/errors';
import { OutboxService } from '../src/outbox/outbox.service';

/**
 * Courier COD handover (invariant #4): COD is not money-closed until the courier
 * hands over and the cash reconciles. A discrepancy needs a reason; a run cannot be
 * handed over twice; a failed delivery leaves an immutable ledger record.
 */
describe('Courier COD handover (integration)', () => {
  let prisma: PrismaService;
  let courier: CourierService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const outbox = new OutboxService(prisma, { deliver: async () => undefined });
    courier = new CourierService(prisma, new AuditService(prisma), outbox);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.outboxMessage.deleteMany();
    await prisma.courierCommand.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: 'courier-integration-' } } });
  });

  const createCourier = async () => {
    seq += 1;
    return prisma.staffUser.create({
      data: {
        username: `courier-integration-${seq}`,
        passwordHash: 'test-only',
        role: 'courier',
      },
    });
  };

  it('creates a run pending handover and writes delivery.assigned', async () => {
    const staff = await createCourier();
    const run = await courier.createRun({ courierId: staff.id, codTotal: 154900 }, 'dispatcher');
    expect(run.handedOver).toBe(false);
    const evt = await prisma.auditEvent.findFirst({
      where: { type: 'delivery.assigned', refs: { has: run.id } },
    });
    expect(evt).not.toBeNull();
  });

  it('reconciles an exact handover to diff 0 without a shortage', async () => {
    const staff = await createCourier();
    const run = await courier.createRun({ courierId: staff.id, codTotal: 154900 }, 'dispatcher');
    const settled = await courier.handover({ runId: run.id, amount: 154900 }, 'cashier');
    expect(settled.handedOver).toBe(true);
    expect(settled.diff).toBe(0);
    const shortage = await prisma.auditEvent.findFirst({
      where: { type: 'cash.shortage', refs: { has: run.id } },
    });
    expect(shortage).toBeNull();
  });

  it('rejects a short handover without a reason (422), records it with a reason', async () => {
    const staff = await createCourier();
    const run = await courier.createRun({ courierId: staff.id, codTotal: 154900 }, 'dispatcher');

    const err = await courier
      .handover({ runId: run.id, amount: 150000 }, 'cashier')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.getStatus()).toBe(422);
    expect(err.code).toBe('handover_reason_required');

    const settled = await courier.handover(
      { runId: run.id, amount: 150000, reason: 'клиент доплатил картой' },
      'cashier',
    );
    expect(settled.diff).toBe(-4900);
    const shortage = await prisma.auditEvent.findFirst({
      where: { type: 'cash.shortage', refs: { has: run.id } },
    });
    expect(shortage).not.toBeNull();
  });

  it('cannot hand over the same run twice (409)', async () => {
    const staff = await createCourier();
    const run = await courier.createRun({ courierId: staff.id, codTotal: 0 }, 'dispatcher');
    await courier.handover({ runId: run.id, amount: 0 }, 'cashier');
    const err = await courier.handover({ runId: run.id, amount: 0 }, 'cashier').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('cod_already_handed_over');
  });

  it('assigns only courier orders and derives COD from settled payments', async () => {
    const staff = await createCourier();
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967009${seq.toString().padStart(3, '0')}`, name: 'Тест' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'app',
        fulfillmentType: 'courier',
        total: 154900,
        status: 'paid',
        payments: { create: { amount: 50000, method: 'card', status: 'received' } },
      },
    });

    const run = await courier.createRun(
      { courierId: staff.id, codTotal: 104900, orderIds: [order.id] },
      'dispatcher',
    );
    expect(run.collectedTotal).toBe(0);
    const mine = await courier.listMine(staff.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: order.id, status: 'courier_assigned', courierRunId: run.id });
    const push = await prisma.outboxMessage.findFirst({
      where: { channel: 'push', recipient: staff.id, template: 'courier_run_assigned' },
    });
    expect(push?.payload).toMatchObject({
      runId: run.id,
      orderIds: [order.id],
      deepLink: `alistore-courier://deliveries/${order.id}`,
    });
  });

  it('replays delivery commands once and reconciles COD before handover', async () => {
    const staff = await createCourier();
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967019${seq.toString().padStart(3, '0')}`, name: 'COD клиент' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'app',
        fulfillmentType: 'courier',
        total: 2500,
        status: 'packed',
      },
    });
    const run = await courier.createRun(
      { courierId: staff.id, codTotal: 2500, orderIds: [order.id] },
      'dispatcher',
    );

    await courier.startDelivery(order.id, staff.id, 'start-once');
    await courier.startDelivery(order.id, staff.id, 'start-once');
    const wrongCod = await courier
      .completeDelivery(order.id, { codAmount: 2000 }, staff.id, 'deliver-wrong')
      .catch((error) => error);
    expect(wrongCod).toBeInstanceOf(ValidationError);
    const delivered = await courier.completeDelivery(order.id, { codAmount: 2500 }, staff.id, 'deliver-once');
    const replay = await courier.completeDelivery(order.id, { codAmount: 2500 }, staff.id, 'deliver-once');
    expect(delivered.status).toBe('delivered');
    expect(replay).toMatchObject({ id: order.id, status: 'delivered' });
    expect(await prisma.auditEvent.count({ where: { type: 'delivery.out', refs: { has: order.id } } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'delivery.delivered', refs: { has: order.id } } })).toBe(1);

    const settled = await courier.handover({ runId: run.id, amount: 2500 }, 'cashier');
    expect(settled).toMatchObject({ handedOver: true, collectedTotal: 2500, diff: 0 });
  });

  it('records one failed attempt and rejects another courier', async () => {
    const staff = await createCourier();
    const other = await createCourier();
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967029${seq.toString().padStart(3, '0')}`, name: 'Недоступен' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'app',
        fulfillmentType: 'courier',
        total: 1000,
        status: 'out_for_delivery',
        courierId: staff.id,
      },
    });
    const dto = { reason: 'адрес не найден', evidence: { photo: 'evi-1' } };
    const forbidden = await courier.failDelivery(order.id, dto, other.id, 'foreign').catch((error) => error);
    expect(forbidden.getStatus()).toBe(403);
    await courier.failDelivery(order.id, dto, staff.id, 'fail-once');
    await courier.failDelivery(order.id, dto, staff.id, 'fail-once');
    expect(await prisma.auditEvent.count({ where: { type: 'delivery.failed', refs: { has: order.id } } })).toBe(1);
  });
});
