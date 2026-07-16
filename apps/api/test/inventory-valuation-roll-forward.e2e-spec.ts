import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { postAccountingEntryOnTx } from '../src/finance/accounting-journal';

describe('Inventory valuation roll-forward (integration)', () => {
  let prisma: PrismaService;
  let inventory: InventoryService;
  const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sourceType = `test.inventory-roll-forward.${run}`;
  const from = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const to = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const openingAt = new Date(from.getTime() - 60 * 60 * 1000);
  const periodAt = (hours: number) => new Date(from.getTime() + hours * 60 * 60 * 1000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    inventory = new InventoryService(prisma, audit, new ApprovalsService(prisma, audit));
  });

  afterAll(async () => {
    const products = await prisma.product.findMany({ where: { sku: { startsWith: `ROLL-${run}` } }, select: { id: true } });
    const productIds = products.map((product) => product.id);
    await prisma.$transaction(async (tx) => {
      await tx.inventoryValuationReversal.deleteMany({ where: { productId: { in: productIds } } });
      await tx.inventoryValuationIssue.deleteMany({ where: { productId: { in: productIds } } });
    });
    await prisma.inventoryValuationLayer.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.consignmentItem.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.deviceUnit.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.return.deleteMany({ where: { order: { idempotencyKey: { startsWith: sourceType } } } });
    await prisma.order.deleteMany({ where: { idempotencyKey: { startsWith: sourceType } } });
    await prisma.customer.deleteMany({ where: { phone: { startsWith: `+99677${run.slice(-7)}` } } });
    await prisma.inventoryBalance.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.$transaction([
      prisma.accountingJournalLine.deleteMany({ where: { entry: { sourceType } } }),
      prisma.accountingJournalEntry.deleteMany({ where: { sourceType } }),
    ]);
    await prisma.$disconnect();
  });

  it('proves opening + movements = closing by product/location and agrees with GL 1200', async () => {
    const baseline = await inventory.valuationRollForward(from.toISOString(), to.toISOString());
    const product = await prisma.product.create({
      data: {
        sku: `ROLL-${run}`,
        name: 'Roll-forward product',
        category: 'test',
        price: 200,
        cost: 100,
        trackingMode: 'quantity',
        attrs: {},
      },
    });
    const source = await prisma.inventoryBalance.create({
      data: { productId: product.id, location: 'ROLL-A', onHand: 10, inventoryValue: 1000 },
    });
    const destination = await prisma.inventoryBalance.create({
      data: { productId: product.id, location: 'ROLL-B', onHand: 2, inventoryValue: 200 },
    });
    const openingLayer = await prisma.inventoryValuationLayer.create({
      data: {
        productId: product.id,
        balanceId: source.id,
        location: 'ROLL-A',
        sourceType,
        sourceRef: 'opening',
        unitCost: 100,
        quantityReceived: 10,
        quantityRemaining: 5,
        createdAt: openingAt,
      },
    });
    await prisma.inventoryValuationLayer.createMany({ data: [
      {
        productId: product.id, balanceId: source.id, location: 'ROLL-A', sourceType,
        sourceRef: 'receipt', unitCost: 100, quantityReceived: 4, quantityRemaining: 4, createdAt: periodAt(1),
      },
      {
        productId: product.id, balanceId: source.id, location: 'ROLL-A', sourceType: 'inventory.adjustment',
        sourceRef: `${sourceType}:adjust-in`, unitCost: 100, quantityReceived: 1, quantityRemaining: 1, createdAt: periodAt(2),
      },
    ] });
    const customer = await prisma.customer.create({
      data: { phone: `+99677${run.slice(-7)}01`, name: 'Roll Forward' },
    });
    const order = await prisma.order.create({
      data: { customerId: customer.id, idempotencyKey: `${sourceType}:order`, channel: 'web', total: 300, status: 'completed' },
    });
    const ret = await prisma.return.create({ data: { orderId: order.id, reason: 'test return', status: 'reconciled' } });
    const saleIssue = await prisma.$transaction(async (tx) => {
      const issue = await tx.inventoryValuationIssue.create({
        data: {
          productId: product.id, layerId: openingLayer.id, orderId: order.id, sourceType: 'sale',
          sourceRef: `${sourceType}:sale`, location: 'ROLL-A', quantity: 3, reversedQty: 1,
          unitCost: 100, totalCost: 300, createdAt: periodAt(3),
        },
      });
      await tx.inventoryValuationReversal.create({
        data: {
          issueId: issue.id, productId: product.id, returnId: ret.id, sourceType: 'inventory.return',
          sourceRef: `${ret.id}:${issue.id}:1`, location: 'ROLL-A', quantity: 1, unitCost: 100,
          totalCost: 100, createdAt: periodAt(4),
        },
      });
      return issue;
    });
    await prisma.inventoryValuationIssue.create({
      data: {
        productId: product.id, layerId: openingLayer.id, sourceType: 'inventory.write_off',
        sourceRef: `${sourceType}:write-off`, location: 'ROLL-A', quantity: 1,
        unitCost: 100, totalCost: 100, createdAt: periodAt(5),
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        productId: product.id, qty: 2, valuationQty: 2, type: 'moved', from: 'ROLL-A', to: 'ROLL-B',
        unitCost: 100, totalValue: 200, createdAt: periodAt(6),
      },
    });
    await prisma.inventoryValuationLayer.create({
      data: {
        productId: product.id,
        balanceId: destination.id,
        location: 'ROLL-B',
        sourceType: 'inventory.transfer',
        sourceRef: `${sourceType}:transfer-layer`,
        unitCost: 100,
        quantityReceived: 2,
        quantityRemaining: 2,
        createdAt: periodAt(6),
      },
    });

    await postGl(openingAt, 'opening', 1000);
    await postGl(periodAt(1), 'receipt', 400);
    await postGl(periodAt(2), 'adjust-in', 100);
    await postGl(periodAt(3), 'sale', -300);
    await postGl(periodAt(4), 'return', 100);
    await postGl(periodAt(5), 'write-off', -100);

    const report = await inventory.valuationRollForward(from.toISOString(), to.toISOString());
    expect(report.rows.find((row) => row.productId === product.id && row.location === 'ROLL-A')).toMatchObject({
      opening: { quantity: 10, value: 1000 },
      receipts: { quantity: 4, value: 400 },
      returns: { quantity: 1, value: 100 },
      transferOut: { quantity: 2, value: 200 },
      issues: { quantity: 3, value: 300 },
      adjustmentsIn: { quantity: 1, value: 100 },
      adjustmentsOut: { quantity: 1, value: 100 },
      closing: { quantity: 10, value: 1000 },
    });
    expect(report.rows.find((row) => row.productId === product.id && row.location === 'ROLL-B')).toMatchObject({
      transferIn: { quantity: 2, value: 200 },
      closing: { quantity: 2, value: 200 },
    });
    expect(report.summary).toMatchObject({
      openingValue: baseline.summary.openingValue + 1000,
      closingValue: baseline.summary.closingValue + 1200,
      glOpening: baseline.summary.glOpening + 1000,
      glClosing: baseline.summary.glClosing + 1200,
      missingReversalQuantity: baseline.summary.missingReversalQuantity,
      incompleteTransfers: baseline.summary.incompleteTransfers,
      incompleteSerializedReceipts: baseline.summary.incompleteSerializedReceipts,
      incompleteServiceConsumptions: baseline.summary.incompleteServiceConsumptions,
      unknownIssueLocations: baseline.summary.unknownIssueLocations,
      unknownReversalLocations: baseline.summary.unknownReversalLocations,
      legacyConsignmentIssues: baseline.summary.legacyConsignmentIssues,
      incompleteQuantityBalances: baseline.summary.incompleteQuantityBalances,
      openingDifference: baseline.summary.openingDifference,
      closingDifference: baseline.summary.closingDifference,
      complete: baseline.summary.complete,
      consistent: baseline.summary.consistent,
    });
  });

  it('uses [from,to), preserves zero-cost quantity, and excludes consignment transfer value', async () => {
    const product = await prisma.product.create({
      data: {
        sku: `ROLL-${run}-EDGE`, name: 'Roll-forward edge product', category: 'test',
        price: 50, cost: 0, trackingMode: 'serialized', attrs: {},
      },
    });
    const balance = await prisma.inventoryBalance.create({
      data: { productId: product.id, location: 'ROLL-A', onHand: 2, inventoryValue: 0 },
    });
    await prisma.inventoryValuationLayer.create({
      data: {
        productId: product.id, balanceId: balance.id, location: 'ROLL-A', sourceType,
        sourceRef: 'edge-opening', unitCost: 0, quantityReceived: 2, quantityRemaining: 1,
        createdAt: openingAt,
      },
    });
    await prisma.inventoryMovement.createMany({ data: [
      { productId: product.id, qty: 1, valuationQty: 1, type: 'received', to: 'ROLL-A', unitCost: 0, totalValue: 0, createdAt: from },
      { productId: product.id, qty: 1, valuationQty: 1, type: 'received', to: 'ROLL-A', unitCost: 0, totalValue: 0, createdAt: to },
    ] });
    await prisma.inventoryValuationIssue.create({
      data: {
        productId: product.id, sourceType: 'sale', sourceRef: `${sourceType}:zero-cost-sale`,
        location: 'ROLL-A', quantity: 1, unitCost: 0, totalCost: 0, createdAt: from,
      },
    });
    const unit = await prisma.deviceUnit.create({
      data: { imei: `ROLL-${run}-IMEI`, productId: product.id, location: 'ROLL-A', status: 'in_stock' },
    });
    await prisma.consignmentItem.create({
      data: {
        idempotencyKey: `${sourceType}:consignment`, unitId: unit.id, productId: product.id,
        ownerName: 'Test owner', commissionBps: 1000, createdBy: 'test',
      },
    });

    await inventory.transfer({ imei: unit.imei, to: 'ROLL-B' }, 'test');
    const transfer = await prisma.inventoryMovement.findFirstOrThrow({
      where: { productId: product.id, type: 'moved' }, orderBy: { createdAt: 'desc' },
    });
    expect(transfer).toMatchObject({ valuationQty: 0, unitCost: 0, totalValue: 0 });

    const report = await inventory.valuationRollForward(from.toISOString(), to.toISOString());
    const sourceRow = report.rows.find((row) => row.productId === product.id && row.location === 'ROLL-A');
    expect(sourceRow).toMatchObject({
      opening: { quantity: 2, value: 0 },
      receipts: { quantity: 1, value: 0 },
      issues: { quantity: 1, value: 0 },
      closing: { quantity: 2, value: 0 },
    });
    expect(report.rows.find((row) => row.productId === product.id && row.location === 'ROLL-B')).toMatchObject({
      transferIn: { quantity: 0, value: 0 },
    });
  });

  it('rejects an unbounded reporting period', async () => {
    await expect(inventory.valuationRollForward(
      '2024-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
    )).rejects.toMatchObject({ code: 'valuation_period_too_large' });
  });

  async function postGl(occurredAt: Date, ref: string, inventoryDelta: number) {
    await prisma.$transaction((tx) => postAccountingEntryOnTx(tx, {
      idempotencyKey: `${sourceType}:${ref}`,
      sourceType,
      sourceRef: ref,
      description: ref,
      occurredAt,
      createdBy: 'test',
      lines: inventoryDelta > 0
        ? [
          { accountCode: '1200', debit: inventoryDelta },
          { accountCode: '3000', credit: inventoryDelta },
        ]
        : [
          { accountCode: '5000', debit: Math.abs(inventoryDelta) },
          { accountCode: '1200', credit: Math.abs(inventoryDelta) },
        ],
    }));
  }
});
