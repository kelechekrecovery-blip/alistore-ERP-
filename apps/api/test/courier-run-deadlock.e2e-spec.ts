import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { CourierService } from '../src/courier/courier.service';
import { ConflictError, ForbiddenError, ValidationError } from '../src/common/errors';
import { OutboxService } from '../src/outbox/outbox.service';
import { UnitsService } from '../src/units/units.service';

/**
 * Courier run deadlock (LOGIC-002): a failed delivery must not block the run
 * forever. The order can be pulled off the run (COD recalculated, ledger event,
 * idempotent), and a partial handover is allowed with a mandatory reason while
 * the COD discrepancy postings reuse the existing shortage/overage pattern.
 */
describe('Courier run deadlock (LOGIC-002)', () => {
  let prisma: PrismaService;
  let courier: CourierService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const outbox = new OutboxService(prisma, { deliver: async () => undefined });
    courier = new CourierService(prisma, new AuditService(prisma), outbox, new UnitsService(prisma));
  });

  const clean = async () => {
    // Движения ящика ссылаются на проводки (FK RESTRICT) — раньше них.
    await prisma.cashDrawerMovement.deleteMany();
    await prisma.outboxMessage.deleteMany();
    await prisma.courierCommand.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.$transaction([
      prisma.accountingJournalLine.deleteMany({
        where: { entry: { sourceType: { startsWith: 'cod.' } } },
      }),
      prisma.accountingJournalEntry.deleteMany({
        where: { sourceType: { startsWith: 'cod.' } },
      }),
    ]);
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: 'courier-deadlock-' } } });
  };

  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await clean();
    // Сдача COD теперь попадает в кассовую смену принявшего кассира
    // (`shifts/cash-drawer.ts`): спек написан до этого контроля.
    await prisma.cashShift.deleteMany({ where: { staffId: 'cashier' } });
    await prisma.cashShift.create({
      data: { staffId: 'cashier', point: 'BISHKEK-1', openCash: 0, openedAt: new Date() },
    });
  });

  const createCourier = async () => {
    seq += 1;
    return prisma.staffUser.create({
      data: {
        username: `courier-deadlock-${seq}`,
        passwordHash: 'test-only',
        role: 'courier',
      },
    });
  };

  const createCodOrder = async (customerId: string, total: number, label: string) => {
    seq += 1;
    return prisma.order.create({
      data: {
        customerId,
        channel: 'app',
        fulfillmentType: 'courier',
        paymentMode: 'cod',
        total,
        status: 'packed',
        items: { create: { lineNumber: 1, sku: `DEADLOCK-SVC-${label}-${seq}`, qty: 1, price: total } },
      },
    });
  };

  const createCustomer = async () => {
    seq += 1;
    return prisma.customer.create({
      data: { phone: `+9967066${seq.toString().padStart(3, '0')}`, name: 'Deadlock клиент' },
    });
  };

  it('removes a failed delivery from the run, recalculates COD and completes handover', async () => {
    const staff = await createCourier();
    const customer = await createCustomer();
    const delivered = await createCodOrder(customer.id, 1500, 'A');
    const stuck = await createCodOrder(customer.id, 1000, 'B');
    const run = await courier.createRun(
      { courierId: staff.id, codTotal: 2500, orderIds: [delivered.id, stuck.id] },
      'dispatcher',
      `assign-deadlock-${seq}`,
    );
    await courier.startDelivery(delivered.id, staff.id, `start-a-${seq}`);
    await courier.startDelivery(stuck.id, staff.id, `start-b-${seq}`);
    await courier.completeDelivery(delivered.id, { codAmount: 1500 }, staff.id, `deliver-a-${seq}`);
    await courier.failDelivery(stuck.id, { reason: 'клиент недоступен' }, staff.id, `fail-b-${seq}`);

    // Deadlock before the fix: collected 1500 of 2500 and no way to pull the order off.
    await expect(courier.handover(
      { runId: run.id, amount: 1500 },
      'cashier',
      undefined,
      `handover-blocked-${run.id}`,
    )).rejects.toMatchObject({ code: 'run_delivery_incomplete' });

    const removed = await courier.removeOrderFromRun(
      stuck.id,
      { reason: 'перевоз завтра' },
      staff.id,
      staff.id,
      `remove-b-${seq}`,
    );
    expect(removed).toMatchObject({
      orderId: stuck.id,
      runId: run.id,
      status: 'paid',
      codReleased: 1000,
      codTotal: 1500,
    });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: stuck.id } })).toMatchObject({
      status: 'paid',
      courierId: null,
      courierRunId: null,
    });
    expect(await prisma.courierRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
      codTotal: 1500,
      collectedTotal: 1500,
    });
    const unassigned = await prisma.auditEvent.findFirst({
      where: { type: 'delivery.unassigned', refs: { has: stuck.id } },
    });
    expect(unassigned?.payload).toMatchObject({
      runId: run.id,
      from: 'out_for_delivery',
      to: 'paid',
      codReleased: 1000,
      reason: 'перевоз завтра',
    });

    const settled = await courier.handover(
      { runId: run.id, amount: 1500 },
      'cashier',
      undefined,
      `handover-after-remove-${run.id}`,
    );
    expect(settled).toMatchObject({ handedOver: true, diff: 0 });

    // The removed order can be dispatched again on a new run.
    const rerun = await courier.createRun(
      { courierId: staff.id, codTotal: 1000, orderIds: [stuck.id] },
      'dispatcher',
      `reassign-${stuck.id}`,
    );
    expect(rerun.orderIds).toEqual([stuck.id]);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: stuck.id } })).toMatchObject({
      status: 'courier_assigned',
      courierRunId: rerun.id,
    });
  });

  it('allows a partial handover with a reason and posts only the collected amount', async () => {
    const staff = await createCourier();
    const customer = await createCustomer();
    const delivered = await createCodOrder(customer.id, 1500, 'A');
    const stuck = await createCodOrder(customer.id, 1000, 'B');
    const run = await courier.createRun(
      { courierId: staff.id, codTotal: 2500, orderIds: [delivered.id, stuck.id] },
      'dispatcher',
      `assign-partial-${seq}`,
    );
    await courier.startDelivery(delivered.id, staff.id, `start-pa-${seq}`);
    await courier.startDelivery(stuck.id, staff.id, `start-pb-${seq}`);
    await courier.completeDelivery(delivered.id, { codAmount: 1500 }, staff.id, `deliver-pa-${seq}`);
    await courier.failDelivery(stuck.id, { reason: 'адрес не найден' }, staff.id, `fail-pb-${seq}`);

    // Partial handover without a reason is still rejected.
    await expect(courier.handover(
      { runId: run.id, amount: 1500 },
      'cashier',
      undefined,
      `handover-partial-noreason-${run.id}`,
    )).rejects.toMatchObject({ code: 'run_delivery_incomplete' });

    const key = `handover-partial-${run.id}`;
    const reason = 'второй заказ не доставлен, перевоз';
    const settled = await courier.handover(
      { runId: run.id, amount: 1500, reason },
      'cashier',
      undefined,
      key,
    );
    expect(settled).toMatchObject({
      handedOver: true,
      codTotal: 2500,
      collectedTotal: 1500,
      handoverReason: reason,
      diff: 0,
    });
    const handoverEvt = await prisma.auditEvent.findFirst({
      where: { type: 'cash.handover', refs: { has: run.id } },
    });
    expect(handoverEvt?.payload).toMatchObject({
      codTotal: 2500,
      collectedTotal: 1500,
      amount: 1500,
      diff: 0,
      reason,
    });
    const entry = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { sourceType_sourceRef: { sourceType: 'cod.handover', sourceRef: `${run.id}:${key}` } },
      include: { lines: true },
    });
    expect(entry.lines).toHaveLength(2);
    expect(entry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1000', debit: 1500 }),
      expect.objectContaining({ accountCode: '1100', credit: 1500 }),
    ]));
    expect(await prisma.auditEvent.count({ where: { type: 'cash.shortage', refs: { has: run.id } } })).toBe(0);

    // Same key replays the stored response instead of posting again.
    const replay = await courier.handover({ runId: run.id, amount: 1500, reason }, 'cashier', undefined, key);
    expect(replay).toMatchObject({ handedOver: true, diff: 0 });
    expect(await prisma.auditEvent.count({ where: { type: 'cash.handover', refs: { has: run.id } } })).toBe(1);
  });

  it('books a shortage on top of a partial handover through the existing discrepancy pattern', async () => {
    const staff = await createCourier();
    const customer = await createCustomer();
    const delivered = await createCodOrder(customer.id, 1500, 'A');
    const stuck = await createCodOrder(customer.id, 1000, 'B');
    const run = await courier.createRun(
      { courierId: staff.id, codTotal: 2500, orderIds: [delivered.id, stuck.id] },
      'dispatcher',
      `assign-short-${seq}`,
    );
    await courier.startDelivery(delivered.id, staff.id, `start-sa-${seq}`);
    await courier.startDelivery(stuck.id, staff.id, `start-sb-${seq}`);
    await courier.completeDelivery(delivered.id, { codAmount: 1500 }, staff.id, `deliver-sa-${seq}`);
    await courier.failDelivery(stuck.id, { reason: 'клиент переехал' }, staff.id, `fail-sb-${seq}`);

    const key = `handover-short-${run.id}`;
    const settled = await courier.handover(
      { runId: run.id, amount: 1400, reason: 'курьер потерял 100 сом' },
      'cashier',
      undefined,
      key,
    );
    expect(settled).toMatchObject({ handedOver: true, diff: -100 });
    const entry = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { sourceType_sourceRef: { sourceType: 'cod.handover', sourceRef: `${run.id}:${key}` } },
      include: { lines: true },
    });
    expect(entry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1000', debit: 1400 }),
      expect.objectContaining({ accountCode: '6990', debit: 100 }),
      expect.objectContaining({ accountCode: '1100', credit: 1500 }),
    ]));
    const shortage = await prisma.auditEvent.findFirst({
      where: { type: 'cash.shortage', refs: { has: run.id } },
    });
    expect(shortage?.payload).toMatchObject({ diff: -100, reason: 'курьер потерял 100 сом' });
  });

  it('replays removal idempotently and forbids a foreign courier', async () => {
    const staff = await createCourier();
    const other = await createCourier();
    const customer = await createCustomer();
    const order = await createCodOrder(customer.id, 1000, 'IDEM');
    const run = await courier.createRun(
      { courierId: staff.id, codTotal: 1000, orderIds: [order.id] },
      'dispatcher',
      `assign-idem-${seq}`,
    );
    await courier.startDelivery(order.id, staff.id, `start-idem-${seq}`);
    await courier.failDelivery(order.id, { reason: 'не открывает дверь' }, staff.id, `fail-idem-${seq}`);

    const foreign = await courier.removeOrderFromRun(
      order.id,
      { reason: 'чужой курьер' },
      other.id,
      other.id,
      `remove-foreign-${seq}`,
    ).catch((error) => error);
    expect(foreign).toBeInstanceOf(ForbiddenError);

    const first = await courier.removeOrderFromRun(
      order.id,
      { reason: 'перевоз' },
      staff.id,
      staff.id,
      `remove-idem-${seq}`,
    );
    const replay = await courier.removeOrderFromRun(
      order.id,
      { reason: 'перевоз' },
      staff.id,
      staff.id,
      `remove-idem-${seq}`,
    );
    expect(replay).toEqual(first);
    expect(await prisma.auditEvent.count({ where: { type: 'delivery.unassigned', refs: { has: order.id } } })).toBe(1);
    expect(await prisma.courierRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ codTotal: 0 });

    // A fresh key cannot remove what is already off the run.
    const again = await courier.removeOrderFromRun(
      order.id,
      { reason: 'перевоз' },
      staff.id,
      staff.id,
      `remove-again-${seq}`,
    ).catch((error) => error);
    expect(again).toBeInstanceOf(ConflictError);
    expect(again.code).toBe('order_not_in_run');
  });

  it('rejects removal of delivered orders, handed-over runs and missing reasons', async () => {
    const staff = await createCourier();
    const customer = await createCustomer();
    const delivered = await createCodOrder(customer.id, 1500, 'DONE');
    const enRoute = await createCodOrder(customer.id, 700, 'ENROUTE');
    const run = await courier.createRun(
      { courierId: staff.id, codTotal: 2200, orderIds: [delivered.id, enRoute.id] },
      'dispatcher',
      `assign-guard-${seq}`,
    );
    await courier.startDelivery(delivered.id, staff.id, `start-guard-${seq}`);
    await courier.completeDelivery(delivered.id, { codAmount: 1500 }, staff.id, `deliver-guard-${seq}`);

    const notRemovable = await courier.removeOrderFromRun(
      delivered.id,
      { reason: 'слишком поздно' },
      staff.id,
      staff.id,
      `remove-delivered-${seq}`,
    ).catch((error) => error);
    expect(notRemovable).toBeInstanceOf(ConflictError);
    expect(notRemovable.code).toBe('order_not_removable');

    await courier.handover(
      { runId: run.id, amount: 1500, reason: 'частичная сдача, второй заказ в пути' },
      'cashier',
      undefined,
      `handover-guard-${run.id}`,
    );
    const handedOver = await courier.removeOrderFromRun(
      enRoute.id,
      { reason: 'после сдачи' },
      'admin-1',
      undefined,
      `remove-handed-over-${seq}`,
    ).catch((error) => error);
    expect(handedOver).toBeInstanceOf(ConflictError);
    expect(handedOver.code).toBe('cod_already_handed_over');

    // A dispatcher (admin/owner) pulls an assigned-not-started order off another run.
    const pending = await createCodOrder(customer.id, 700, 'PENDING');
    const secondRun = await courier.createRun(
      { courierId: staff.id, codTotal: 700, orderIds: [pending.id] },
      'dispatcher',
      `assign-pending-${seq}`,
    );
    const missingReason = await courier.removeOrderFromRun(
      pending.id,
      { reason: '   ' },
      'admin-1',
      undefined,
      `remove-noreason-${seq}`,
    ).catch((error) => error);
    expect(missingReason).toBeInstanceOf(ValidationError);
    expect(missingReason.code).toBe('removal_reason_required');

    const byAdmin = await courier.removeOrderFromRun(
      pending.id,
      { reason: 'ошибка диспетчера' },
      'admin-1',
      undefined,
      `remove-by-admin-${seq}`,
    );
    expect(byAdmin).toMatchObject({ orderId: pending.id, status: 'paid', codTotal: 0 });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
      status: 'paid',
      courierId: null,
      courierRunId: null,
    });
    expect(await prisma.courierRun.findUniqueOrThrow({ where: { id: secondRun.id } })).toMatchObject({ codTotal: 0 });
  });
});
