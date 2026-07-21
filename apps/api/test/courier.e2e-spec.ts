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
    const quantityConsignmentRefs = (await prisma.quantityConsignmentAllocation.findMany({ select: { id: true } }))
      .map((allocation) => allocation.id);
    await prisma.outboxMessage.deleteMany();
    await prisma.courierCommand.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.$transaction([
      prisma.accountingJournalLine.deleteMany({
        where: { entry: { OR: [
          { sourceType: { startsWith: 'cod.' } },
          { sourceType: 'inventory.cogs', sourceRef: { in: issueIds } },
          { sourceType: 'quantity-consignment.sale', sourceRef: { in: quantityConsignmentRefs } },
        ] } },
      }),
      prisma.accountingJournalEntry.deleteMany({
        where: { OR: [
          { sourceType: { startsWith: 'cod.' } },
          { sourceType: 'inventory.cogs', sourceRef: { in: issueIds } },
          { sourceType: 'quantity-consignment.sale', sourceRef: { in: quantityConsignmentRefs } },
        ] },
      }),
    ]);
    await prisma.$transaction(async (tx) => {
      await tx.inventoryValuationReversal.deleteMany({ where: { issueId: { in: issueIds } } });
      await tx.inventoryValuationIssue.deleteMany({ where: { id: { in: issueIds } } });
    });
    await prisma.inventoryValuationLayer.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.quantityConsignmentAllocation.deleteMany();
    await prisma.quantityConsignmentLot.deleteMany();
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
    const run = await courier.createRun({ courierId: staff.id, codTotal: 154900 }, 'dispatcher', `assign-${staff.id}`);
    expect(run.handedOver).toBe(false);
    const evt = await prisma.auditEvent.findFirst({
      where: { type: 'delivery.assigned', refs: { has: run.id } },
    });
    expect(evt).not.toBeNull();
  });

  it('reconciles an exact handover to diff 0 without a shortage', async () => {
    const staff = await createCourier();
    const run = await courier.createRun({ courierId: staff.id, codTotal: 154900 }, 'dispatcher', `assign-${staff.id}`);
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
    const run = await courier.createRun({ courierId: staff.id, codTotal: 154900 }, 'dispatcher', `assign-${staff.id}`);

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
    const run = await courier.createRun({ courierId: staff.id, codTotal: 0 }, 'dispatcher', `assign-${staff.id}`);
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
        paymentMode: 'cod',
        total: 154900,
        status: 'paid',
        payments: { create: { amount: 50000, method: 'card', status: 'received' } },
      },
    });
    const run = await courier.createRun(
      { courierId: staff.id, codTotal: 104900, orderIds: [order.id] },
      'dispatcher',
      `assign-${order.id}`,
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

  it('does not turn an unpaid prepaid order into COD during assignment', async () => {
    const staff = await createCourier();
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967029${seq.toString().padStart(3, '0')}`, name: 'Prepaid клиент' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'web',
        fulfillmentType: 'courier',
        paymentMode: 'prepaid',
        paymentModeExplicit: true,
        total: 5000,
        status: 'packed',
      },
    });

    await expect(courier.createRun(
      { courierId: staff.id, codTotal: 5000, orderIds: [order.id] },
      'dispatcher',
      `assign-prepaid-${order.id}`,
    )).rejects.toMatchObject({ code: 'order_payment_unsettled' });
    expect(await prisma.courierRun.count()).toBe(0);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: 'packed',
      courierId: null,
      courierRunId: null,
    });
  });

  it('delivers prepaid and fully settled COD orders after payment finalized inventory', async () => {
    const staff = await createCourier();
    for (const paymentMode of ['prepaid', 'cod'] as const) {
      seq += 1;
      const customer = await prisma.customer.create({
        data: { phone: `+9967039${seq.toString().padStart(3, '0')}`, name: `${paymentMode} delivered` },
      });
      const product = await prisma.product.create({
        data: { sku: `COD-STOCK-SETTLED-${paymentMode}-${seq}`, name: 'Settled stock', price: 5000, cost: 3500, category: 'phones', attrs: {} },
      });
      const imei = `COD-STOCK-SETTLED-${paymentMode}-${seq}-IMEI`;
      const order = await prisma.order.create({
        data: {
          customerId: customer.id,
          channel: 'web',
          fulfillmentType: 'courier',
          paymentMode,
          total: 5000,
          status: 'packed',
          items: { create: { lineNumber: 1, sku: product.sku, qty: 1, price: 5000, imei } },
          payments: { create: { amount: 5000, method: 'card', status: 'received', txnId: `settled-${paymentMode}-${seq}` } },
        },
      });
      await prisma.deviceUnit.create({
        data: { imei, productId: product.id, status: 'sold', location: 'BISHKEK-1', orderId: order.id, acquisitionCost: 3500 },
      });
      const issue = await prisma.inventoryValuationIssue.create({
        data: {
          productId: product.id,
          orderId: order.id,
          imei,
          sourceType: 'sale',
          sourceRef: `${order.id}:${imei}`,
          location: 'BISHKEK-1',
          quantity: 1,
          unitCost: 3500,
          totalCost: 3500,
        },
      });
      await prisma.accountingJournalEntry.create({
        data: {
          idempotencyKey: `accounting:inventory.cogs:${issue.id}`,
          sourceType: 'inventory.cogs',
          sourceRef: issue.id,
          description: `Себестоимость продажи ${order.id}`,
          occurredAt: new Date(),
          createdBy: 'payment-worker',
          lines: {
            create: [
              { accountCode: '5000', debit: 3500, memo: 'Себестоимость проданного товара' },
              { accountCode: '1200', credit: 3500, memo: 'Выбытие товарного запаса' },
            ],
          },
        },
      });
      await courier.createRun({ courierId: staff.id, codTotal: 0, orderIds: [order.id] }, 'dispatcher', `assign-settled-${paymentMode}-${seq}`);
      await courier.startDelivery(order.id, staff.id, `start-settled-${paymentMode}-${seq}`);
      const delivered = await courier.completeDelivery(order.id, { codAmount: 0 }, staff.id, `deliver-settled-${paymentMode}-${seq}`);
      expect(delivered.status).toBe('delivered');
      expect(await prisma.inventoryValuationIssue.count({ where: { orderId: order.id } })).toBe(1);
    }
  });

  it('rejects settled tracked inventory without valuation and COGS accounting', async () => {
    const staff = await createCourier();
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967038${seq.toString().padStart(3, '0')}`, name: 'Broken settled inventory' },
    });
    const product = await prisma.product.create({
      data: { sku: `COD-STOCK-BROKEN-${seq}`, name: 'Broken stock', price: 5000, cost: 3500, category: 'phones', attrs: {} },
    });
    const imei = `COD-STOCK-BROKEN-${seq}-IMEI`;
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'web',
        fulfillmentType: 'courier',
        paymentMode: 'prepaid',
        total: 5000,
        status: 'packed',
        items: {
          create: {
            lineNumber: 1,
            sku: product.sku,
            qty: 1,
            price: 5000,
            imei,
            inventorySnapshot: { productId: product.id, trackingMode: 'serialized', components: [] },
          },
        },
        payments: { create: { amount: 5000, method: 'card', status: 'received', txnId: `broken-${seq}` } },
      },
    });
    await prisma.deviceUnit.create({
      data: { imei, productId: product.id, status: 'sold', location: 'BISHKEK-1', orderId: order.id, acquisitionCost: 3500 },
    });
    await courier.createRun({ courierId: staff.id, codTotal: 0, orderIds: [order.id] }, 'dispatcher', `assign-broken-${seq}`);
    await courier.startDelivery(order.id, staff.id, `start-broken-${seq}`);

    await expect(courier.completeDelivery(
      order.id,
      { codAmount: 0 },
      staff.id,
      `deliver-broken-${seq}`,
    )).rejects.toMatchObject({ code: 'order_inventory_unfinalized' });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'out_for_delivery' });
  });

  it('delivers a settled non-stock service order without inventing inventory history', async () => {
    const staff = await createCourier();
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967049${seq.toString().padStart(3, '0')}`, name: 'Service delivery' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'web',
        fulfillmentType: 'courier',
        paymentMode: 'prepaid',
        total: 1500,
        status: 'packed',
        items: { create: { lineNumber: 1, sku: `SERVICE-${seq}`, qty: 1, price: 1500 } },
        payments: { create: { amount: 1500, method: 'card', status: 'received', txnId: `service-${seq}` } },
      },
    });

    await courier.createRun(
      { courierId: staff.id, codTotal: 0, orderIds: [order.id] },
      'dispatcher',
      `assign-service-${seq}`,
    );
    await courier.startDelivery(order.id, staff.id, `start-service-${seq}`);
    const delivered = await courier.completeDelivery(
      order.id,
      { codAmount: 0 },
      staff.id,
      `deliver-service-${seq}`,
    );
    expect(delivered.status).toBe('delivered');
    expect(await prisma.reservation.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.orderBundleAllocation.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.orderQuantityAllocation.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('collects COD for a service-only order without requiring stock reservations', async () => {
    const staff = await createCourier();
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967059${seq.toString().padStart(3, '0')}`, name: 'COD service' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'web',
        fulfillmentType: 'courier',
        paymentMode: 'cod',
        total: 1500,
        status: 'packed',
        items: { create: { lineNumber: 1, sku: `COD-SERVICE-${seq}`, qty: 1, price: 1500 } },
      },
    });
    const run = await courier.createRun(
      { courierId: staff.id, codTotal: order.total, orderIds: [order.id] },
      'dispatcher',
      `assign-cod-service-${seq}`,
    );
    await courier.startDelivery(order.id, staff.id, `start-cod-service-${seq}`);
    expect(await courier.completeDelivery(
      order.id,
      { codAmount: order.total },
      staff.id,
      `deliver-cod-service-${seq}`,
    )).toMatchObject({ status: 'delivered' });
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: 'cod.receivable', sourceRef: order.id } })).toBe(1);
    expect(await prisma.courierRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ collectedTotal: order.total });
  });

  it('records partial COD at the door and leaves the unpaid balance in receivables', async () => {
    const staff = await createCourier();
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967058${seq.toString().padStart(3, '0')}`, name: 'Partial COD customer' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'web',
        fulfillmentType: 'courier',
        paymentMode: 'cod',
        total: 1500,
        status: 'packed',
        items: { create: { lineNumber: 1, sku: `COD-PARTIAL-${seq}`, qty: 1, price: 1500 } },
      },
    });
    const run = await courier.createRun(
      { courierId: staff.id, codTotal: order.total, orderIds: [order.id] },
      'dispatcher',
      `assign-cod-partial-${seq}`,
    );
    await courier.startDelivery(order.id, staff.id, `start-cod-partial-${seq}`);

    await expect(courier.completeDelivery(
      order.id,
      { codAmount: 500 },
      staff.id,
      `deliver-cod-partial-missing-reason-${seq}`,
    )).rejects.toMatchObject({ code: 'delivery_partial_cod_reason_required' });

    const delivered = await courier.completeDelivery(
      order.id,
      { codAmount: 500, reason: 'Клиент внёс часть суммы, остаток подтверждён' },
      staff.id,
      `deliver-cod-partial-${seq}`,
    );
    expect(delivered).toMatchObject({ status: 'delivered' });
    expect(await prisma.courierRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
      codTotal: 1500,
      collectedTotal: 500,
    });
    const receivable = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { sourceType_sourceRef: { sourceType: 'cod.receivable', sourceRef: order.id } },
      include: { lines: true },
    });
    expect(receivable.documentAmount).toBe(1500);
    expect(receivable.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1100', debit: 1500 }),
    ]));
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { type: 'delivery.delivered', refs: { has: order.id } } });
    expect(event.payload).toMatchObject({ codAmount: 500, expectedCod: 1500, remainingReceivable: 1000 });
  });

  it('collects COD for mixed stock and service lines while finalizing only tracked inventory', async () => {
    const staff = await createCourier();
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967069${seq.toString().padStart(3, '0')}`, name: 'COD mixed' },
    });
    const product = await prisma.product.create({
      data: { sku: `COD-STOCK-MIXED-${seq}`, name: 'Mixed stock', price: 2000, cost: 1200, category: 'phones', attrs: {} },
    });
    const imei = `COD-STOCK-MIXED-${seq}-IMEI`;
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'web',
        fulfillmentType: 'courier',
        paymentMode: 'cod',
        total: 2500,
        status: 'packed',
        items: {
          create: [
            {
              lineNumber: 1,
              sku: product.sku,
              qty: 1,
              price: 2000,
              imei,
              inventorySnapshot: { productId: product.id, trackingMode: 'serialized', components: [] },
            },
            { lineNumber: 2, sku: `COD-MIXED-SERVICE-${seq}`, qty: 1, price: 500 },
          ],
        },
      },
    });
    await prisma.deviceUnit.create({
      data: { imei, productId: product.id, status: 'reserved', location: 'BISHKEK-1', orderId: order.id, acquisitionCost: 1200 },
    });
    await prisma.reservation.create({
      data: { orderId: order.id, imei, active: true, expiresAt: new Date(Date.now() + 60_000) },
    });

    await courier.createRun(
      { courierId: staff.id, codTotal: order.total, orderIds: [order.id] },
      'dispatcher',
      `assign-cod-mixed-${seq}`,
    );
    await courier.startDelivery(order.id, staff.id, `start-cod-mixed-${seq}`);
    expect(await courier.completeDelivery(
      order.id,
      { codAmount: order.total },
      staff.id,
      `deliver-cod-mixed-${seq}`,
    )).toMatchObject({ status: 'delivered' });
    expect(await prisma.deviceUnit.findUniqueOrThrow({ where: { imei } })).toMatchObject({ status: 'sold', orderId: order.id });
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: 'cod.receivable', sourceRef: order.id } })).toBe(1);
  });

  it('splits mixed quantity COD into owned COGS and consignment liability', async () => {
    const staff = await createCourier();
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967068${seq.toString().padStart(3, '0')}`, name: 'Mixed quantity COD' },
    });
    const product = await prisma.product.create({
      data: {
        sku: `COD-STOCK-QTY-MIXED-${seq}`,
        name: 'Mixed quantity stock',
        price: 1000,
        cost: 500,
        category: 'accessories',
        trackingMode: 'quantity',
        attrs: {},
      },
    });
    const balance = await prisma.inventoryBalance.create({
      data: { productId: product.id, location: 'BISHKEK-1', onHand: 3, reserved: 3, inventoryValue: 500 },
    });
    await prisma.inventoryValuationLayer.create({
      data: {
        productId: product.id,
        balanceId: balance.id,
        location: 'BISHKEK-1',
        sourceType: 'test-receipt',
        sourceRef: `cod-mixed-owned-${seq}`,
        unitCost: 500,
        quantityReceived: 1,
        quantityRemaining: 1,
      },
    });
    const lot = await prisma.quantityConsignmentLot.create({
      data: {
        idempotencyKey: `cod-mixed-lot-${seq}`,
        productId: product.id,
        balanceId: balance.id,
        location: 'BISHKEK-1',
        ownerName: 'Owner COD',
        commissionBps: 1000,
        receivedQty: 2,
        availableQty: 0,
        reservedQty: 2,
        createdBy: 'warehouse',
      },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'web',
        fulfillmentType: 'courier',
        paymentMode: 'cod',
        paymentModeExplicit: true,
        total: 3000,
        status: 'packed',
        items: {
          create: {
            lineNumber: 1,
            sku: product.sku,
            qty: 3,
            price: 1000,
            inventorySnapshot: { productId: product.id, trackingMode: 'quantity', components: [] },
          },
        },
      },
      include: { items: true },
    });
    const allocation = await prisma.orderQuantityAllocation.create({
      data: {
        orderId: order.id,
        orderItemId: order.items[0].id,
        productId: product.id,
        balanceId: balance.id,
        sku: product.sku,
        location: balance.location,
        qty: 3,
      },
    });
    await prisma.quantityConsignmentAllocation.create({
      data: { lotId: lot.id, orderQuantityAllocationId: allocation.id, qty: 2 },
    });
    await prisma.reservation.create({
      data: { orderId: order.id, quantityAllocationId: allocation.id, active: true, expiresAt: new Date(Date.now() + 60_000) },
    });

    await courier.createRun({ courierId: staff.id, codTotal: 3000, orderIds: [order.id] }, 'dispatcher', `assign-mixed-qty-${seq}`);
    await courier.startDelivery(order.id, staff.id, `start-mixed-qty-${seq}`);
    await expect(courier.completeDelivery(order.id, { codAmount: 3000 }, staff.id, `deliver-mixed-qty-${seq}`))
      .resolves.toMatchObject({ status: 'delivered' });

    const issue = await prisma.inventoryValuationIssue.findFirstOrThrow({ where: { orderId: order.id } });
    expect(issue).toMatchObject({ quantity: 1, unitCost: 500, totalCost: 500 });
    const ownerAllocation = await prisma.quantityConsignmentAllocation.findFirstOrThrow({ where: { saleOrderId: order.id } });
    expect(ownerAllocation).toMatchObject({ qty: 2, ownerAmount: 1800, status: 'sold' });
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: 'inventory.cogs', sourceRef: issue.id } })).toBe(1);
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: 'quantity-consignment.sale', sourceRef: ownerAllocation.id } })).toBe(1);
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } })).toMatchObject({ onHand: 0, reserved: 0, inventoryValue: 0 });
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
        paymentMode: 'cod',
        total: 2500,
        taxBaseAmount: 2200,
        taxAmount: 300,
        status: 'packed',
        items: { create: { lineNumber: 1, sku: `COD-STOCK-${seq}`, qty: 1, price: 2500, taxCode: 'vat_standard', taxRateBps: 1200, taxBaseAmount: 2200, taxAmount: 300, imei: `COD-STOCK-${seq}-IMEI` } },
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
      `assign-${order.id}`,
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
    await prisma.reservation.updateMany({ where: { orderId: order.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
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
        paymentMode: 'cod',
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
        paymentMode: 'cod',
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
    const run = await courier.createRun({ courierId: staff.id, codTotal: 2000, orderIds: [order.id] }, 'dispatcher', `assign-${order.id}`);

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

  /**
   * Недобор не должен запирать наличность всего рейса.
   *
   * Существующий тест выше доводит частичную оплату до доставки и на этом
   * заканчивается — а дыра открывается на следующем шаге. При недоборе
   * дебиторка проводится на полную сумму заказа, а `collectedTotal` растёт на
   * фактически полученную. Сдача же требовала, чтобы признанная дебиторка в
   * точности равнялась `collectedTotal`, — совпасть они при недоборе не могут
   * никогда. Снять доставленный заказ с рейса тоже нельзя.
   *
   * Итог: один клиент, доплативший половину, замораживал у курьера всю
   * наличность рейса без выхода через интерфейс.
   */
  it('позволяет сдать выручку рейса после частичной оплаты у двери', async () => {
    const staff = await createCourier();
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967059${seq.toString().padStart(3, '0')}`, name: 'Partial handover' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'web',
        fulfillmentType: 'courier',
        paymentMode: 'cod',
        total: 2000,
        status: 'packed',
        items: { create: { lineNumber: 1, sku: `COD-PH-${seq}`, qty: 1, price: 2000 } },
      },
    });
    const run = await courier.createRun(
      { courierId: staff.id, codTotal: order.total, orderIds: [order.id] },
      'dispatcher',
      `assign-ph-${seq}`,
    );
    await courier.startDelivery(order.id, staff.id, `start-ph-${seq}`);
    await courier.completeDelivery(
      order.id,
      { codAmount: 800, reason: 'Клиент внёс часть, остаток обещал в пятницу' },
      staff.id,
      `deliver-ph-${seq}`,
    );

    const settled = await courier.handover(
      { runId: run.id, amount: 800, reason: 'Недобор по заказу: остаток за клиентом' },
      'cashier-1',
      undefined,
      `handover-ph-${seq}`,
    );

    expect(settled).toMatchObject({ handedOver: true, handoverAmount: 800 });
  });

  /**
   * Нулевой COD означает долг клиента, а не недостачу курьера.
   *
   * `cod.receivable` уже признаёт полный долг при доставке. При сдаче нулевой
   * суммы нельзя создавать `cash.shortage`: это исказило бы сверку и превратило
   * остаток дебиторки клиента в долг сотрудника.
   */
  it('сохраняет дебиторку и не создаёт ложную недостачу при нулевом COD', async () => {
    const staff = await createCourier();
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967060${seq.toString().padStart(3, '0')}`, name: 'Zero collected' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'web',
        fulfillmentType: 'courier',
        paymentMode: 'cod',
        total: 3000,
        status: 'packed',
        items: { create: { lineNumber: 1, sku: `COD-ZC-${seq}`, qty: 1, price: 3000 } },
      },
    });
    const run = await courier.createRun(
      { courierId: staff.id, codTotal: order.total, orderIds: [order.id] },
      'dispatcher',
      `assign-zc-${seq}`,
    );
    await courier.startDelivery(order.id, staff.id, `start-zc-${seq}`);
    await courier.completeDelivery(
      order.id,
      { codAmount: 0, reason: 'Клиент попросил отсрочку' },
      staff.id,
      `deliver-zc-${seq}`,
    );

    await courier.handover(
      { runId: run.id, amount: 0, reason: 'Ничего не собрано' },
      'cashier-1',
      undefined,
      `handover-zc-${seq}`,
    );

    const receivable = await prisma.accountingJournalEntry.findUnique({
      where: { sourceType_sourceRef: { sourceType: 'cod.receivable', sourceRef: order.id } },
    });
    expect(receivable?.documentAmount).toBe(3000);

    const shortages = await prisma.auditEvent.findMany({
      where: { type: 'cash.shortage', refs: { has: run.id } },
    });
    expect(shortages).toHaveLength(0);
  });
});
