import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { CourierService } from '../src/courier/courier.service';
import { ConflictError, ValidationError } from '../src/common/errors';
import { OutboxService } from '../src/outbox/outbox.service';
import { UnitsService } from '../src/units/units.service';

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
    courier = new CourierService(prisma, new AuditService(prisma), outbox, new UnitsService(prisma));
  });

  const clean = async () => {
    const fixtureProducts = await prisma.product.findMany({
      where: { sku: { startsWith: 'COD-STOCK-' } },
      select: { id: true },
    });
    const productIds = fixtureProducts.map((product) => product.id);
    const fixtureIssues = await prisma.inventoryValuationIssue.findMany({
      where: { productId: { in: productIds } },
      select: { id: true },
    });
    const issueIds = fixtureIssues.map((issue) => issue.id);
    await prisma.outboxMessage.deleteMany();
    await prisma.courierCommand.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.$transaction([
      prisma.accountingJournalLine.deleteMany({
        where: { entry: { OR: [{ sourceType: { startsWith: 'cod.' } }, { sourceType: 'inventory.cogs', sourceRef: { in: issueIds } }] } },
      }),
      prisma.accountingJournalEntry.deleteMany({
        where: { OR: [{ sourceType: { startsWith: 'cod.' } }, { sourceType: 'inventory.cogs', sourceRef: { in: issueIds } }] },
      }),
    ]);
    await prisma.inventoryValuationIssue.deleteMany({ where: { id: { in: issueIds } } });
    await prisma.inventoryValuationLayer.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.orderQuantityAllocation.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.deviceUnit.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventoryBalance.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.customer.deleteMany();
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: 'courier-integration-' } } });
  };

  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  beforeEach(clean);

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
    const settled = await courier.handover({ runId: run.id, amount: 154900 }, 'cashier', undefined, `handover-exact-${run.id}`);
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
      .handover({ runId: run.id, amount: 150000 }, 'cashier', undefined, `handover-missing-reason-${run.id}`)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.getStatus()).toBe(422);
    expect(err.code).toBe('handover_reason_required');

    const settled = await courier.handover(
      { runId: run.id, amount: 150000, reason: 'клиент доплатил картой' },
      'cashier',
      undefined,
      `handover-short-${run.id}`,
    );
    expect(settled.diff).toBe(-4900);
    const shortage = await prisma.auditEvent.findFirst({
      where: { type: 'cash.shortage', refs: { has: run.id } },
    });
    expect(shortage).not.toBeNull();
  });

  it('replays the same handover key and rejects a different one', async () => {
    const staff = await createCourier();
    const run = await courier.createRun({ courierId: staff.id, codTotal: 0 }, 'dispatcher');
    const key = `handover-replay-${run.id}`;
    const [first, replay] = await Promise.all([
      courier.handover({ runId: run.id, amount: 0 }, 'cashier', undefined, key),
      courier.handover({ runId: run.id, amount: 0 }, 'cashier', undefined, key),
    ]);
    expect(replay).toMatchObject({ id: first.id, handedOver: true, diff: 0 });
    expect(await prisma.auditEvent.count({ where: { type: 'cash.handover', refs: { has: run.id } } })).toBe(1);
    const err = await courier.handover({ runId: run.id, amount: 0 }, 'cashier', undefined, `${key}-other`).catch((e) => e);
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
        taxBaseAmount: 2200,
        taxAmount: 300,
        status: 'packed',
        items: { create: { lineNumber: 1, sku: `COD-TAX-${seq}`, qty: 1, price: 2500, taxCode: 'vat_standard', taxRateBps: 1200, taxBaseAmount: 2200, taxAmount: 300 } },
      },
    });
    const product = await prisma.product.create({
      data: { sku: `COD-STOCK-${seq}`, name: 'COD stock fixture', price: 2500, cost: 1700, category: 'phones', attrs: {} },
    });
    const unit = await prisma.deviceUnit.create({
      data: {
        imei: `COD-STOCK-${seq}-IMEI`,
        productId: product.id,
        status: 'reserved',
        location: 'BISHKEK-1',
        orderId: order.id,
        acquisitionCost: 1700,
      },
    });
    const reservation = await prisma.reservation.create({
      data: { orderId: order.id, imei: unit.imei, active: true, expiresAt: new Date(Date.now() + 60_000) },
    });
    const run = await courier.createRun(
      { courierId: staff.id, codTotal: 2500, orderIds: [order.id] },
      'dispatcher',
    );

    await expect(courier.handover(
      { runId: run.id, amount: 2500 },
      'cashier',
      undefined,
      `handover-before-delivery-${run.id}`,
    )).rejects.toMatchObject({ code: 'run_delivery_incomplete' });
    await prisma.courierRun.update({ where: { id: run.id }, data: { collectedTotal: 2500 } });
    await expect(courier.handover(
      { runId: run.id, amount: 2500 },
      'cashier',
      undefined,
      `handover-without-receivable-${run.id}`,
    )).rejects.toMatchObject({ code: 'cod_receivable_not_recognized' });
    await prisma.courierRun.update({ where: { id: run.id }, data: { collectedTotal: 0 } });

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
    const receivable = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { sourceType_sourceRef: { sourceType: 'cod.receivable', sourceRef: order.id } },
      include: { lines: true },
    });
    expect(receivable).toMatchObject({ documentAmount: 2500, taxAmount: 300, taxCode: 'vat_output:vat_standard' });
    expect(receivable.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1100', debit: 2500 }),
      expect.objectContaining({ accountCode: '4000', credit: 2200 }),
      expect.objectContaining({ accountCode: '2200', credit: 300 }),
    ]));
    expect(await prisma.deviceUnit.findUniqueOrThrow({ where: { id: unit.id } })).toMatchObject({ status: 'sold', orderId: order.id });
    expect(await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).toMatchObject({ active: false });
    const valuationIssues = await prisma.inventoryValuationIssue.findMany({ where: { orderId: order.id } });
    expect(valuationIssues).toHaveLength(1);
    const cogs = await prisma.accountingJournalEntry.findMany({
      where: { sourceType: 'inventory.cogs', sourceRef: { in: valuationIssues.map((issue) => issue.id) } },
      include: { lines: true },
    });
    expect(cogs).toHaveLength(1);
    expect(cogs[0].lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '5000', debit: 1700 }),
      expect.objectContaining({ accountCode: '1200', credit: 1700 }),
    ]));

    const settled = await courier.handover({ runId: run.id, amount: 2500 }, 'cashier', undefined, `handover-delivery-${run.id}`);
    expect(settled).toMatchObject({ handedOver: true, collectedTotal: 2500, diff: 0 });
    const codEntries = await prisma.accountingJournalEntry.findMany({
      where: { sourceType: { in: ['cod.receivable', 'cod.handover'] } },
      include: { lines: true },
    });
    const receivableBalance = codEntries.flatMap((entry) => entry.lines)
      .filter((line) => line.accountCode === '1100')
      .reduce((sum, line) => sum + line.debit - line.credit, 0);
    expect(receivableBalance).toBe(0);
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

  it('consumes quantity stock and FIFO value exactly once on COD delivery', async () => {
    const staff = await createCourier();
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967049${seq.toString().padStart(3, '0')}`, name: 'Quantity COD' },
    });
    const product = await prisma.product.create({
      data: { sku: `COD-STOCK-Q-${seq}`, name: 'Quantity COD fixture', price: 1000, cost: 600, category: 'accessories', trackingMode: 'quantity', attrs: {} },
    });
    const balance = await prisma.inventoryBalance.create({
      data: { productId: product.id, location: 'BISHKEK-1', onHand: 3, reserved: 2, inventoryValue: 1800 },
    });
    const layer = await prisma.inventoryValuationLayer.create({
      data: { productId: product.id, balanceId: balance.id, location: balance.location, sourceType: 'test.receive', sourceRef: `cod-quantity-${seq}`, unitCost: 600, quantityReceived: 3, quantityRemaining: 3 },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'app',
        fulfillmentType: 'courier',
        total: 2000,
        status: 'packed',
        items: { create: { lineNumber: 1, sku: product.sku, qty: 2, price: 1000, taxCode: 'exempt', taxRateBps: 0, taxBaseAmount: 2000, taxAmount: 0 } },
      },
      include: { items: true },
    });
    const allocation = await prisma.orderQuantityAllocation.create({
      data: { orderId: order.id, orderItemId: order.items[0].id, productId: product.id, balanceId: balance.id, sku: product.sku, location: balance.location, qty: 2 },
    });
    await prisma.reservation.create({
      data: { orderId: order.id, quantityAllocationId: allocation.id, active: true, expiresAt: new Date(Date.now() + 60_000) },
    });
    const run = await courier.createRun({ courierId: staff.id, codTotal: 2000, orderIds: [order.id] }, 'dispatcher');

    await courier.startDelivery(order.id, staff.id, `quantity-start-${seq}`);
    await courier.completeDelivery(order.id, { codAmount: 2000 }, staff.id, `quantity-deliver-${seq}`);
    await courier.completeDelivery(order.id, { codAmount: 2000 }, staff.id, `quantity-deliver-${seq}`);

    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } })).toMatchObject({ onHand: 1, reserved: 0, inventoryValue: 600 });
    expect(await prisma.inventoryValuationLayer.findUniqueOrThrow({ where: { id: layer.id } })).toMatchObject({ quantityRemaining: 1 });
    expect(await prisma.orderQuantityAllocation.findUniqueOrThrow({ where: { id: allocation.id } })).toMatchObject({ active: false });
    const issues = await prisma.inventoryValuationIssue.findMany({ where: { orderId: order.id } });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ quantity: 2, unitCost: 600, totalCost: 1200 });
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: 'inventory.cogs', sourceRef: issues[0].id } })).toBe(1);
    expect(await prisma.courierRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ collectedTotal: 2000 });
  });
});
