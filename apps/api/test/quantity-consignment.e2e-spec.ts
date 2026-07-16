import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ReturnsService } from '../src/returns/returns.service';

describe('Quantity consignment inventory (integration)', () => {
  let prisma: PrismaService;
  let approvals: ApprovalsService;
  let inventory: InventoryService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let returns: ReturnsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    approvals = new ApprovalsService(prisma, audit);
    const units = new UnitsService(prisma);
    inventory = new InventoryService(prisma, audit, approvals);
    orders = new OrdersService(prisma, audit, units);
    payments = new PaymentsService(prisma, audit, units, approvals);
    returns = new ReturnsService(prisma, audit);
  });

  beforeEach(() => clean());
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  async function clean() {
    const fixtureProducts = await prisma.product.findMany({ where: { sku: { startsWith: 'QCONS-' } }, select: { id: true } });
    const productIds = fixtureProducts.map((product) => product.id);
    const issues = await prisma.inventoryValuationIssue.findMany({ where: { productId: { in: productIds } }, select: { id: true } });
    const issueIds = issues.map((issue) => issue.id);
    const consignmentAllocations = await prisma.quantityConsignmentAllocation.findMany({
      where: { lot: { productId: { in: productIds } } },
      select: { id: true },
    });
    const consignmentRefs = consignmentAllocations.map((allocation) => allocation.id);
    const accountingWhere = { OR: [
      { sourceType: 'inventory.cogs', sourceRef: { in: issueIds } },
      { sourceType: 'quantity-consignment.sale', sourceRef: { in: consignmentRefs } },
    ] };
    await prisma.$transaction([
      prisma.accountingJournalLine.deleteMany({ where: { entry: accountingWhere } }),
      prisma.accountingJournalEntry.deleteMany({ where: accountingWhere }),
    ]);
    await prisma.auditEvent.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.quantityConsignmentAdjustment.deleteMany();
    await prisma.quantityConsignmentAllocation.deleteMany();
    await prisma.orderQuantityAllocation.deleteMany();
    await prisma.quantityConsignmentLot.deleteMany();
    await prisma.inventoryValuationReversal.deleteMany({ where: { issueId: { in: issueIds } } });
    await prisma.inventoryValuationIssue.deleteMany({ where: { id: { in: issueIds } } });
    await prisma.inventoryValuationLayer.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.consignmentAdjustment.deleteMany();
    await prisma.consignmentItem.deleteMany();
    await prisma.consignmentPayout.deleteMany();
    await prisma.returnItem.deleteMany();
    await prisma.return.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.loyaltyEntry.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.productBundleComponent.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  }

  async function setup(quantity = 5) {
    const suffix = `${Date.now()}-${++seq}`;
    const product = await prisma.product.create({
      data: { sku: `QCONS-${suffix}`, name: 'Consignment cases', price: 1_000, cost: 0, category: 'accessories', trackingMode: 'quantity', attrs: {} },
    });
    const customer = await prisma.customer.create({ data: { phone: `+996709${suffix.slice(-6)}`, name: 'Quantity buyer' } });
    const lot = await inventory.receiveQuantityConsignment({
      idempotencyKey: `qcons-receive-${suffix}`,
      productId: product.id,
      location: 'BISHKEK-1',
      quantity,
      ownerName: 'Поставщик А.',
      ownerContact: '+996555000222',
      commissionBps: 1000,
    }, 'warehouse:qcons');
    return { product, customer, lot };
  }

  async function reserve(product: { sku: string }, customerId: string, qty: number) {
    const order = await orders.create({
      customerId,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: qty * 1_000,
      items: [{ sku: product.sku, qty, price: 1_000 }],
    }, 'customer:qcons');
    await orders.reserve(order.id, 'customer:qcons');
    return order;
  }

  it('receives idempotently, releases on cancellation and moves owner attribution with stock', async () => {
    const { product, customer, lot } = await setup();
    const replay = await inventory.receiveQuantityConsignment({
      idempotencyKey: lot.idempotencyKey,
      productId: product.id,
      location: 'BISHKEK-1',
      quantity: 5,
      ownerName: 'Поставщик А.',
      ownerContact: '+996555000222',
      commissionBps: 1000,
    }, 'warehouse:qcons');
    expect(replay.id).toBe(lot.id);
    const order = await reserve(product, customer.id, 2);
    expect(await prisma.quantityConsignmentLot.findUnique({ where: { id: lot.id } })).toMatchObject({ availableQty: 3, reservedQty: 2 });
    await orders.transition(order.id, 'cancelled', 'customer:qcons');
    expect(await prisma.quantityConsignmentLot.findUnique({ where: { id: lot.id } })).toMatchObject({ availableQty: 5, reservedQty: 0 });
    expect(await prisma.inventoryBalance.findFirst({ where: { productId: product.id } })).toMatchObject({ onHand: 5, reserved: 0 });
    await inventory.transferQuantity({
      idempotencyKey: `qcons-transfer-${seq}`,
      productId: product.id,
      from: 'BISHKEK-1',
      to: 'BISHKEK-2',
      qty: 3,
    }, 'warehouse:qcons');
    expect(await prisma.quantityConsignmentLot.findUnique({ where: { id: lot.id } })).toMatchObject({ availableQty: 2 });
    expect(await prisma.quantityConsignmentLot.findFirst({ where: { productId: product.id, location: 'BISHKEK-2' } })).toMatchObject({ availableQty: 3, ownerName: 'Поставщик А.' });
    expect(await prisma.inventoryBalance.findUnique({ where: { productId_location: { productId: product.id, location: 'BISHKEK-2' } } })).toMatchObject({ onHand: 3, reserved: 0 });
    const writeOff = await inventory.movement({
      productId: product.id,
      location: 'BISHKEK-2',
      qty: 1,
      type: 'write_off',
      reason: 'damage',
    }, 'warehouse:qcons');
    await expect(approvals.decide(writeOff.approvalId, {
      status: 'approved',
      approver: 'owner:qcons',
      approverRole: 'owner',
    })).rejects.toMatchObject({ code: 'consignment_stock_requires_owner_process' });
  });

  it('accrues, pays and compensates a returned quantity owner liability exactly once', async () => {
    const { product, customer, lot } = await setup();
    const order = await reserve(product, customer.id, 2);
    await payments.pay({ orderId: order.id, amount: 2_000, method: 'card', txnId: `qcons-sale-${seq}` }, 'cashier:qcons');
    const allocation = await prisma.quantityConsignmentAllocation.findFirstOrThrow({ where: { saleOrderId: order.id } });
    expect(allocation).toMatchObject({ qty: 2, status: 'sold', salePrice: 2_000, commissionAmount: 200, ownerAmount: 1_800 });
    expect(await prisma.quantityConsignmentLot.findUnique({ where: { id: lot.id } })).toMatchObject({ availableQty: 3, reservedQty: 0 });

    await prisma.order.update({ where: { id: order.id }, data: { status: 'completed' } });
    const payout = await inventory.createConsignmentPayout({ idempotencyKey: `qcons-payout-${seq}`, quantityAllocationIds: [allocation.id] }, 'owner:qcons');
    expect(payout).toMatchObject({ grossAmount: 2_000, commissionAmount: 200, ownerAmount: 1_800 });
    await inventory.payConsignmentPayout(payout.id, { paymentKey: `qcons-bank-${seq}` }, 'owner:qcons');

    const ret = await prisma.return.create({ data: { orderId: order.id, reason: 'Не подошло', status: 'paid' } });
    await returns.transition(ret.id, 'reconciled', 'returns:qcons', 'BISHKEK-1');
    expect(await prisma.inventoryBalance.findFirst({ where: { productId: product.id } })).toMatchObject({ onHand: 5, reserved: 0 });
    expect(await prisma.quantityConsignmentAllocation.findUnique({ where: { id: allocation.id } })).toMatchObject({ status: 'withdrawn', payoutId: payout.id });
    expect(await prisma.quantityConsignmentAdjustment.findUnique({ where: { returnId_allocationId: { returnId: ret.id, allocationId: allocation.id } } })).toMatchObject({ amount: 1_800, status: 'open' });
    const ownerReceivable = await prisma.accountingJournalEntry.findUnique({
      where: { idempotencyKey: `accounting:owner-return:owner-receivable:${ret.id}:quantity:${allocation.id}` },
      include: { lines: true },
    });
    expect(ownerReceivable?.sourceType).toBe('consignment.return.owner_receivable');
    expect(ownerReceivable?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1100', debit: 1800 }),
      expect.objectContaining({ accountCode: '4000', credit: 1800 }),
    ]));
    expect(await prisma.quantityConsignmentLot.count({ where: { productId: product.id } })).toBe(2);
    expect(await prisma.auditEvent.count({ where: { type: 'consignment.returned', refs: { has: allocation.id } } })).toBe(1);
  });

  it('splits mixed owned and consignment quantity stock into COGS and owner liability', async () => {
    const { product, customer } = await setup(5);
    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
    });
    await prisma.inventoryBalance.update({
      where: { id: balance.id },
      data: { onHand: { increment: 2 }, inventoryValue: { increment: 1_000 } },
    });
    await prisma.inventoryValuationLayer.create({
      data: {
        productId: product.id,
        balanceId: balance.id,
        location: 'BISHKEK-1',
        sourceType: 'test-receipt',
        sourceRef: `mixed-owned-${seq}`,
        unitCost: 500,
        quantityReceived: 2,
        quantityRemaining: 2,
      },
    });
    const order = await reserve(product, customer.id, 7);
    await payments.pay({ orderId: order.id, amount: 7_000, method: 'card', txnId: `qcons-mixed-${seq}` }, 'cashier:qcons');

    const ownerAllocation = await prisma.quantityConsignmentAllocation.findFirstOrThrow({ where: { saleOrderId: order.id } });
    expect(ownerAllocation).toMatchObject({ qty: 5, ownerAmount: 4_500, status: 'sold' });
    const valuation = await prisma.inventoryValuationIssue.findMany({ where: { orderId: order.id } });
    expect(valuation.reduce((sum, issue) => sum + issue.quantity, 0)).toBe(2);
    expect(valuation.reduce((sum, issue) => sum + issue.totalCost, 0)).toBe(1_000);
    expect(await prisma.accountingJournalEntry.count({
      where: { sourceType: 'inventory.cogs', sourceRef: { in: valuation.map((issue) => issue.id) } },
    })).toBe(1);
    expect(await prisma.accountingJournalEntry.count({
      where: { sourceType: 'quantity-consignment.sale', sourceRef: ownerAllocation.id },
    })).toBe(1);
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } })).toMatchObject({
      onHand: 0,
      reserved: 0,
      inventoryValue: 0,
    });
  });

  it('splits mixed stock for a fully loyalty-funded order without a synthetic payment', async () => {
    const { product, customer } = await setup(5);
    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
    });
    await prisma.inventoryBalance.update({
      where: { id: balance.id },
      data: { onHand: { increment: 2 }, inventoryValue: { increment: 1_000 } },
    });
    await prisma.inventoryValuationLayer.create({
      data: {
        productId: product.id,
        balanceId: balance.id,
        location: 'BISHKEK-1',
        sourceType: 'test-receipt',
        sourceRef: `mixed-loyalty-owned-${seq}`,
        unitCost: 500,
        quantityReceived: 2,
        quantityRemaining: 2,
      },
    });
    await prisma.loyaltyEntry.create({
      data: {
        customerId: customer.id,
        label: 'Полная оплата бонусами',
        amount: 7_000,
        sourceRef: `mixed-loyalty-seed-${seq}`,
      },
    });
    const order = await orders.createFromCatalog({
      customerId: customer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      total: 1,
      loyaltyPoints: 7_000,
      items: [{ sku: product.sku, qty: 7, price: 1 }],
    }, customer.id, `qcons-mixed-loyalty-${seq}`, true);

    expect(order.total).toBe(0);
    expect((await orders.fulfill(order.id, 'warehouse:qcons')).order.status).toBe('paid');
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
    const ownerAllocation = await prisma.quantityConsignmentAllocation.findFirstOrThrow({
      where: { saleOrderId: order.id },
    });
    expect(ownerAllocation).toMatchObject({ qty: 5, ownerAmount: 4_500, status: 'sold' });
    const valuation = await prisma.inventoryValuationIssue.findMany({ where: { orderId: order.id } });
    expect(valuation.reduce((sum, issue) => sum + issue.quantity, 0)).toBe(2);
    expect(valuation.reduce((sum, issue) => sum + issue.totalCost, 0)).toBe(1_000);
    expect(await prisma.accountingJournalEntry.count({
      where: { sourceType: 'inventory.cogs', sourceRef: { in: valuation.map((issue) => issue.id) } },
    })).toBe(1);
    expect(await prisma.accountingJournalEntry.count({
      where: { sourceType: 'quantity-consignment.sale', sourceRef: ownerAllocation.id },
    })).toBe(1);
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } })).toMatchObject({
      onHand: 0,
      reserved: 0,
      inventoryValue: 0,
    });
  });

  it('keeps the unreturned quantity payable after a partial return is reconciled', async () => {
    const { product, customer } = await setup();
    const order = await reserve(product, customer.id, 2);
    await payments.pay({ orderId: order.id, amount: 2_000, method: 'card', txnId: `qcons-partial-${seq}` }, 'cashier:qcons');
    await prisma.order.update({ where: { id: order.id }, data: { status: 'completed' } });
    const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    const allocation = await prisma.quantityConsignmentAllocation.findFirstOrThrow({ where: { saleOrderId: order.id } });
    const ret = await prisma.return.create({
      data: {
        orderId: order.id,
        reason: 'Частичный возврат',
        status: 'paid',
        refundAmount: 1_000,
        isFullOrder: false,
        items: { create: { orderItemId: orderItem.id, qty: 1, refundAmount: 1_000 } },
      },
    });

    await returns.transition(ret.id, 'reconciled', 'returns:qcons', 'BISHKEK-1');
    expect(await prisma.quantityConsignmentAllocation.findUnique({ where: { id: allocation.id } })).toMatchObject({
      status: 'sold',
      returnedQty: 1,
      returnedSaleAmount: 1_000,
      returnedCommissionAmount: 100,
      returnedOwnerAmount: 900,
    });
    const payout = await inventory.createConsignmentPayout({
      idempotencyKey: `qcons-partial-payout-${seq}`,
      quantityAllocationIds: [allocation.id],
    }, 'owner:qcons');
    expect(payout).toMatchObject({ grossAmount: 1_000, commissionAmount: 100, ownerAmount: 900 });
  });
});
