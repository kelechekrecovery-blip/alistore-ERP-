import { AuditService } from '../src/audit/audit.service';
import { OrderItemHandoverService } from '../src/orders/order-item-handover.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { UnitsService } from '../src/units/units.service';
import { OrderItemReservationService } from '../src/orders/order-item-reservation.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { ReservationsService } from '../src/reservations/reservations.service';
import { ConfigService } from '@nestjs/config';

describe('OrderItemHandoverService', () => {
  const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let prisma: PrismaService;
  let service: OrderItemHandoverService;
  let reservationService: OrderItemReservationService;
  let expiryService: ReservationsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    await cleanFixtures();
    const audit = new AuditService(prisma);
    const units = new UnitsService(prisma);
    const outbox = new OutboxService(prisma, { deliver: async () => undefined });
    const config = new ConfigService({ SUPPLY_PARTIAL_HANDOVER_ENABLED: 'true' });
    service = new OrderItemHandoverService(
      prisma,
      audit,
      units,
      config,
    );
    reservationService = new OrderItemReservationService(prisma, audit, units, outbox, config);
    expiryService = new ReservationsService(prisma, audit, units, outbox);
  });

  afterAll(async () => {
    await cleanFixtures();
    await prisma.$disconnect();
  });

  async function cleanFixtures() {
    const products = await prisma.product.findMany({
      where: { sku: { startsWith: 'LINE-' } },
      select: { id: true },
    });
    const productIds = products.map((row) => row.id);
    const items = await prisma.orderItem.findMany({
      where: { sku: { startsWith: 'LINE-' } },
      select: { id: true, orderId: true },
    });
    const quantityAllocations = await prisma.orderQuantityAllocation.findMany({
      where: { productId: { in: productIds } },
      select: { orderId: true },
    });
    const fixtureCustomers = await prisma.customer.findMany({
      where: { name: { startsWith: 'Line handover ' } },
      select: { id: true },
    });
    const customerOrders = await prisma.order.findMany({
      where: { customerId: { in: fixtureCustomers.map((row) => row.id) } },
      select: { id: true },
    });
    const itemIds = items.map((row) => row.id);
    const orderIds = [...new Set([
      ...items.map((row) => row.orderId),
      ...quantityAllocations.map((row) => row.orderId),
      ...customerOrders.map((row) => row.id),
    ])];
    const issues = await prisma.inventoryValuationIssue.findMany({
      where: { orderId: { in: orderIds } },
      select: { id: true },
    });
    const issueIds = issues.map((row) => row.id);
    const entries = await prisma.accountingJournalEntry.findMany({
      where: {
        OR: [
          { sourceType: 'order_item.handover', sourceRef: { in: itemIds } },
          { sourceType: 'inventory.cogs', sourceRef: { in: issueIds } },
        ],
      },
      select: { id: true },
    });
    const entryIds = entries.map((row) => row.id);
    await prisma.storeOperationCommand.deleteMany({ where: { resourceId: { in: itemIds } } });
    await prisma.auditEvent.deleteMany({ where: { refs: { hasSome: [...orderIds, ...itemIds] } } });
    await prisma.paymentReceivableAllocation.deleteMany({ where: { receivable: { orderId: { in: orderIds } } } });
    await prisma.orderReceivable.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.reservation.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderLineSupply.deleteMany({ where: { orderItem: { orderId: { in: orderIds } } } });
    await prisma.purchaseOrder.deleteMany({ where: { sourceOrderId: { in: orderIds } } });
    await prisma.$transaction([
      prisma.accountingJournalLine.deleteMany({ where: { entryId: { in: entryIds } } }),
      prisma.accountingJournalEntry.deleteMany({ where: { id: { in: entryIds } } }),
    ]);
    await prisma.inventoryValuationIssue.deleteMany({ where: { id: { in: issueIds } } });
    await prisma.orderQuantityAllocation.deleteMany({
      where: { OR: [{ orderId: { in: orderIds } }, { productId: { in: productIds } }] },
    });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.deviceUnit.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventoryValuationLayer.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventoryBalance.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.customer.deleteMany({ where: { name: { startsWith: 'Line handover ' } } });
    await prisma.storePoint.deleteMany({ where: { inventoryLocation: { startsWith: 'LINE-LOC-' } } });
    await prisma.supplier.deleteMany({ where: { name: { startsWith: 'Line supplier ' } } });
  }

  async function customer() {
    seq += 1;
    return prisma.customer.create({
      data: {
        phone: `+99679${String(Date.now() + seq).slice(-7)}`,
        name: `Line handover ${run}-${seq}`,
      },
    });
  }

  async function paymentForLine(orderId: string, orderItemId: string, amount: number) {
    const receivable = await prisma.orderReceivable.create({
      data: { orderId, orderItemId, kind: 'stock_sale', amount, settledAmount: amount, status: 'settled' },
    });
    const payment = await prisma.payment.create({
      data: {
        orderId,
        amount,
        method: 'card',
        status: 'received',
        txnId: `line-handover-payment-${run}-${seq}`,
      },
    });
    await prisma.paymentReceivableAllocation.create({
      data: { paymentId: payment.id, receivableId: receivable.id, amount },
    });
    return { receivable, payment };
  }

  it('hands over only the serialized own-stock line and preserves the active supply line', async () => {
    const buyer = await customer();
    const stock = await prisma.product.create({
      data: {
        sku: `LINE-SERIAL-${run}-${seq}`,
        name: 'Serialized line',
        price: 10_000,
        cost: 6_000,
        category: 'phones',
        taxCode: 'none',
        taxRateBps: 0,
        attrs: {},
      },
    });
    const supply = await prisma.product.create({
      data: {
        sku: `LINE-SUPPLY-${run}-${seq}`,
        name: 'Supply line',
        price: 20_000,
        cost: 14_000,
        category: 'phones',
        attrs: {},
      },
    });
    const imei = `LINE-${Date.now()}-${seq}`;
    const order = await prisma.order.create({
      data: {
        customerId: buyer.id,
        channel: 'web',
        fulfillmentType: 'pickup',
        paymentMode: 'prepaid',
        total: 30_000,
        status: 'confirmed',
        items: {
          create: [
            {
              lineNumber: 1,
              productId: stock.id,
              sku: stock.sku,
              qty: 1,
              price: 10_000,
              unitCost: 6_000,
              taxCode: 'none',
              taxRateBps: 0,
              taxBaseAmount: 10_000,
              taxAmount: 0,
              fulfillmentStatus: 'ready',
              imei,
              inventorySnapshot: { productId: stock.id, trackingMode: 'serialized', components: [] },
            },
            {
              lineNumber: 2,
              productId: supply.id,
              sku: supply.sku,
              qty: 1,
              price: 20_000,
              unitCost: 14_000,
              taxBaseAmount: 17_857,
              taxAmount: 2_143,
              supplyModeSnapshot: 'to_order',
              supplierIdSnapshot: 'test-supplier',
              supplyLeadDaysSnapshot: 5,
              fulfillmentStatus: 'in_transit',
            },
          ],
        },
      },
      include: { items: { orderBy: { lineNumber: 'asc' } } },
    });
    const stockItem = order.items[0];
    const supplyItem = order.items[1];
    await prisma.deviceUnit.create({
      data: {
        imei,
        productId: stock.id,
        status: 'reserved',
        location: 'BISHKEK-1',
        orderId: order.id,
        acquisitionCost: 6_000,
      },
    });
    await prisma.reservation.create({
      data: { orderId: order.id, imei, active: true, expiresAt: new Date(Date.now() + 60_000) },
    });
    await paymentForLine(order.id, stockItem.id, 10_000);

    const key = `line-serialized-${run}-${seq}`;
    const [first, replay] = await Promise.all([
      service.handOver(order.id, stockItem.id, 'staff:seller', key),
      service.handOver(order.id, stockItem.id, 'staff:seller', key),
    ]);
    expect(first).toMatchObject({
      orderId: order.id,
      orderItemId: stockItem.id,
      fulfillmentStatus: 'handed_over',
      orderStatus: 'confirmed',
    });
    expect(replay).toEqual(first);
    await expect(service.handOver(
      order.id,
      stockItem.id,
      'staff:seller',
      `${key}-other`,
    )).rejects.toMatchObject({ code: 'order_item_already_handed_over' });

    expect(await prisma.deviceUnit.findUniqueOrThrow({ where: { imei } }))
      .toMatchObject({ status: 'sold', orderId: order.id });
    expect(await prisma.reservation.findFirstOrThrow({ where: { orderId: order.id, imei } }))
      .toMatchObject({ active: false });
    expect(await prisma.orderItem.findUniqueOrThrow({ where: { id: supplyItem.id } }))
      .toMatchObject({ fulfillmentStatus: 'in_transit', handedOverAt: null });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .toMatchObject({ status: 'confirmed' });
    const revenue = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { sourceType_sourceRef: { sourceType: 'order_item.handover', sourceRef: stockItem.id } },
      include: { lines: true },
    });
    expect(revenue.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '2400', debit: 10_000 }),
      expect.objectContaining({ accountCode: '4000', credit: 10_000 }),
    ]));
    expect(await prisma.accountingJournalEntry.count({
      where: { sourceType: 'order_item.handover', sourceRef: stockItem.id },
    })).toBe(1);
    expect(await prisma.inventoryValuationIssue.count({ where: { orderId: order.id, imei } })).toBe(1);
  });

  it('consumes only the quantity allocation belonging to the handed-over line', async () => {
    const buyer = await customer();
    const product = await prisma.product.create({
      data: {
        sku: `LINE-QUANTITY-${run}-${seq}`,
        name: 'Quantity line',
        price: 1_000,
        cost: 400,
        category: 'accessories',
        trackingMode: 'quantity',
        taxCode: 'none',
        taxRateBps: 0,
        attrs: {},
      },
    });
    const balance = await prisma.inventoryBalance.create({
      data: { productId: product.id, location: 'BISHKEK-1', onHand: 3, reserved: 2, inventoryValue: 1_200 },
    });
    await prisma.inventoryValuationLayer.create({
      data: {
        productId: product.id,
        balanceId: balance.id,
        location: balance.location,
        sourceType: 'test',
        sourceRef: `line-layer-${run}-${seq}`,
        unitCost: 400,
        quantityReceived: 3,
        quantityRemaining: 3,
      },
    });
    const order = await prisma.order.create({
      data: {
        customerId: buyer.id,
        channel: 'web',
        fulfillmentType: 'store',
        paymentMode: 'prepaid',
        total: 2_000,
        status: 'reserved',
        items: {
          create: {
            lineNumber: 1,
            productId: product.id,
            sku: product.sku,
            qty: 2,
            price: 1_000,
            unitCost: 400,
            taxCode: 'none',
            taxRateBps: 0,
            taxBaseAmount: 2_000,
            taxAmount: 0,
            fulfillmentStatus: 'ready',
            inventorySnapshot: { productId: product.id, trackingMode: 'quantity', components: [] },
          },
        },
      },
      include: { items: true },
    });
    const item = order.items[0];
    const allocation = await prisma.orderQuantityAllocation.create({
      data: {
        orderId: order.id,
        orderItemId: item.id,
        productId: product.id,
        balanceId: balance.id,
        sku: product.sku,
        location: balance.location,
        qty: 2,
      },
    });
    await prisma.reservation.create({
      data: {
        orderId: order.id,
        quantityAllocationId: allocation.id,
        active: true,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await paymentForLine(order.id, item.id, 2_000);

    await service.handOver(order.id, item.id, 'staff:seller', `line-quantity-${run}-${seq}`);

    expect(await prisma.orderQuantityAllocation.findUniqueOrThrow({ where: { id: allocation.id } }))
      .toMatchObject({ active: false });
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } }))
      .toMatchObject({ onHand: 1, reserved: 0, inventoryValue: 400 });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .toMatchObject({ status: 'completed' });
    expect(await prisma.inventoryValuationIssue.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('fails closed when stock_sale is not fully settled', async () => {
    const buyer = await customer();
    const product = await prisma.product.create({
      data: {
        sku: `LINE-UNPAID-${run}-${seq}`,
        name: 'Unpaid line',
        price: 5_000,
        cost: 3_000,
        category: 'phones',
        attrs: {},
      },
    });
    const order = await prisma.order.create({
      data: {
        customerId: buyer.id,
        channel: 'web',
        fulfillmentType: 'pickup',
        paymentMode: 'prepaid',
        total: 5_000,
        status: 'reserved',
        items: {
          create: {
            lineNumber: 1,
            productId: product.id,
            sku: product.sku,
            qty: 1,
            price: 5_000,
            taxBaseAmount: 4_464,
            taxAmount: 536,
            fulfillmentStatus: 'ready',
          },
        },
      },
      include: { items: true },
    });
    await prisma.orderReceivable.create({
      data: { orderId: order.id, orderItemId: order.items[0].id, kind: 'stock_sale', amount: 5_000 },
    });

    await expect(service.handOver(
      order.id,
      order.items[0].id,
      'staff:seller',
      `line-unpaid-${run}-${seq}`,
    )).rejects.toMatchObject({ code: 'order_line_receivables_unpaid' });
    expect(await prisma.orderItem.findUniqueOrThrow({ where: { id: order.items[0].id } }))
      .toMatchObject({ fulfillmentStatus: 'ready', handedOverAt: null });
  });

  it('reserves and readies only one mixed own-stock line, then expiry leaves supply state intact', async () => {
    const buyer = await customer();
    const location = `LINE-LOC-${run}-${seq}`;
    const point = await prisma.storePoint.create({
      data: {
        code: `LINE-POINT-${run}-${seq}`,
        name: 'Line point',
        address: 'Bishkek',
        inventoryLocation: location,
        hours: '10:00-20:00',
        active: true,
        createdBy: 'test',
        idempotencyKey: `line-point-${run}-${seq}`,
      },
    });
    const stock = await prisma.product.create({
      data: {
        sku: `LINE-RESERVE-STOCK-${run}-${seq}`,
        name: 'Reserve stock',
        price: 8_000,
        cost: 5_000,
        category: 'phones',
        attrs: {},
      },
    });
    const supply = await prisma.product.create({
      data: {
        sku: `LINE-RESERVE-SUPPLY-${run}-${seq}`,
        name: 'Reserve supply',
        price: 12_000,
        cost: 9_000,
        category: 'phones',
        attrs: {},
      },
    });
    const order = await prisma.order.create({
      data: {
        customerId: buyer.id,
        channel: 'web',
        fulfillmentType: 'pickup',
        paymentMode: 'prepaid',
        storePointId: point.id,
        fulfillmentLocation: location,
        total: 20_000,
        status: 'confirmed',
        items: {
          create: [
            {
              lineNumber: 1,
              productId: stock.id,
              sku: stock.sku,
              qty: 1,
              price: 8_000,
              fulfillmentStatus: 'pending_payment',
              inventorySnapshot: { productId: stock.id, trackingMode: 'serialized', components: [] },
            },
            {
              lineNumber: 2,
              productId: supply.id,
              sku: supply.sku,
              qty: 1,
              price: 12_000,
              supplyModeSnapshot: 'to_order',
              supplyLeadDaysSnapshot: 5,
              fulfillmentStatus: 'in_transit',
            },
          ],
        },
      },
      include: { items: { orderBy: { lineNumber: 'asc' } } },
    });
    const supplierRecord = await prisma.supplier.create({
      data: { name: `Line supplier ${run}-${seq}` },
    });
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        number: `LINE-PO-${run}-${seq}`,
        supplierId: supplierRecord.id,
        sourceOrderId: order.id,
        status: 'sent',
        location,
        createdBy: 'staff:procurement',
        sentAt: new Date(),
        items: {
          create: { productId: supply.id, orderedQty: 1, unitCost: 9_000 },
        },
      },
      include: { items: true },
    });
    await prisma.orderLineSupply.create({
      data: {
        orderItemId: order.items[1].id,
        purchaseOrderItemId: purchaseOrder.items[0].id,
        status: 'in_transit',
        orderedQty: 1,
        actor: 'staff:procurement',
      },
    });
    const stockReceivable = await prisma.orderReceivable.create({
      data: { orderId: order.id, orderItemId: order.items[0].id, kind: 'stock_sale', amount: 8_000 },
    });
    const supplyReceivable = await prisma.orderReceivable.create({
      data: { orderId: order.id, orderItemId: order.items[1].id, kind: 'supply_balance', amount: 9_600 },
    });
    const imei = `LINE-RESERVE-${Date.now()}-${seq}`;
    await prisma.deviceUnit.create({
      data: { imei, productId: stock.id, status: 'in_stock', location, acquisitionCost: 5_000 },
    });

    const reserveKey = `line-reserve-command-${run}-${seq}`;
    await Promise.all([
      reservationService.reserve(order.id, order.items[0].id, 'staff:seller', reserveKey),
      reservationService.reserve(order.id, order.items[0].id, 'staff:seller', reserveKey),
    ]);
    expect(await prisma.orderItem.findUniqueOrThrow({ where: { id: order.items[0].id } }))
      .toMatchObject({ fulfillmentStatus: 'reserved', imei });
    expect(await prisma.orderItem.findUniqueOrThrow({ where: { id: order.items[1].id } }))
      .toMatchObject({ fulfillmentStatus: 'in_transit' });

    const beforeReady = Date.now();
    await reservationService.ready(
      order.id,
      order.items[0].id,
      'staff:seller',
      `line-ready-command-${run}-${seq}`,
    );
    const reservation = await prisma.reservation.findFirstOrThrow({ where: { orderId: order.id, imei } });
    expect(reservation.expiresAt.getTime()).toBeGreaterThanOrEqual(beforeReady + 72 * 60 * 60 * 1000);
    expect(await prisma.orderLineSupply.findUniqueOrThrow({ where: { orderItemId: order.items[1].id } }))
      .toMatchObject({ status: 'in_transit' });

    await prisma.reservation.update({ where: { id: reservation.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    await expiryService.releaseExpired();
    expect(await prisma.orderItem.findUniqueOrThrow({ where: { id: order.items[0].id } }))
      .toMatchObject({ fulfillmentStatus: 'reservation_expired', readyAt: null });
    expect(await prisma.orderLineSupply.findUniqueOrThrow({ where: { orderItemId: order.items[1].id } }))
      .toMatchObject({ status: 'in_transit' });
    expect(await prisma.orderReceivable.findUniqueOrThrow({ where: { id: stockReceivable.id } }))
      .toMatchObject({ status: 'open', settledAmount: 0 });
    expect(await prisma.orderReceivable.findUniqueOrThrow({ where: { id: supplyReceivable.id } }))
      .toMatchObject({ status: 'open', settledAmount: 0 });
  });
});
