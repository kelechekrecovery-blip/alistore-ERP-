import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { InventoryService } from '../src/inventory/inventory.service';

describe('Inventory valuation reconciliation (integration)', () => {
  let prisma: PrismaService;
  let inventory: InventoryService;
  const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sourceType = `test.inventory-reconciliation.${run}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    inventory = new InventoryService(prisma, audit, new ApprovalsService(prisma, audit));
  });

  afterAll(async () => {
    const products = await prisma.product.findMany({
      where: { sku: { startsWith: `RECON-${run}` } },
      select: { id: true },
    });
    const productIds = products.map((product) => product.id);
    await prisma.$transaction(async (tx) => {
      await tx.accountingJournalLine.deleteMany({ where: { entry: { sourceType } } });
      await tx.accountingJournalEntry.deleteMany({ where: { sourceType } });
    });
    await prisma.consignmentItem.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.deviceUnit.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.$transaction(async (tx) => {
      await tx.inventoryValuationReversal.deleteMany({ where: { productId: { in: productIds } } });
      await tx.inventoryValuationIssue.deleteMany({ where: { productId: { in: productIds } } });
    });
    await prisma.inventoryValuationLayer.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.quantityConsignmentLot.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventoryBalance.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.$disconnect();
  });

  it('separates owned FIFO value from consignment and exposes missing serialized costs', async () => {
    const baseline = await inventory.valuationReconciliation();
    const quantityProduct = await prisma.product.create({
      data: {
        sku: `RECON-${run}-QTY`,
        name: 'Reconciliation quantity product',
        category: 'accessories',
        price: 2000,
        cost: 1000,
        trackingMode: 'quantity',
        attrs: {},
      },
    });
    const balance = await prisma.inventoryBalance.create({
      data: { productId: quantityProduct.id, location: 'RECON-WH', onHand: 7, inventoryValue: 5000 },
    });
    await prisma.inventoryValuationLayer.create({
      data: {
        productId: quantityProduct.id,
        balanceId: balance.id,
        location: 'RECON-WH',
        sourceType: sourceType,
        sourceRef: 'quantity-layer',
        unitCost: 1000,
        quantityReceived: 5,
        quantityRemaining: 5,
      },
    });
    await prisma.quantityConsignmentLot.create({
      data: {
        idempotencyKey: `${sourceType}:lot`,
        productId: quantityProduct.id,
        balanceId: balance.id,
        location: 'RECON-WH',
        ownerName: 'Third party',
        commissionBps: 1000,
        receivedQty: 2,
        availableQty: 2,
        createdBy: 'test',
      },
    });
    await prisma.deviceUnit.create({
      data: {
        imei: `${run}-LEGACY-WRONG-TRACKING`,
        productId: quantityProduct.id,
        location: 'RECON-WH',
        acquisitionCost: 7000,
      },
    });

    const serializedProduct = await prisma.product.create({
      data: {
        sku: `RECON-${run}-SER`,
        name: 'Reconciliation serialized product',
        category: 'phones',
        price: 5000,
        cost: 3000,
        trackingMode: 'serialized',
        attrs: {},
      },
    });
    await prisma.deviceUnit.createMany({
      data: [
        { imei: `${run}-OWNED-COST`, productId: serializedProduct.id, location: 'RECON-WH', acquisitionCost: 3000 },
        { imei: `${run}-OWNED-MISSING`, productId: serializedProduct.id, location: 'RECON-WH' },
        { imei: `${run}-CONSIGNMENT`, productId: serializedProduct.id, location: 'RECON-WH', acquisitionCost: 9999 },
      ],
    });
    const consignmentUnit = await prisma.deviceUnit.findUniqueOrThrow({ where: { imei: `${run}-CONSIGNMENT` } });
    await prisma.consignmentItem.create({
      data: {
        idempotencyKey: `${sourceType}:serialized-consignment`,
        unitId: consignmentUnit.id,
        productId: serializedProduct.id,
        ownerName: 'Third party',
        commissionBps: 1000,
        createdBy: 'test',
      },
    });
    await postInventoryDebit(8000, 'initial');

    const report = await inventory.valuationReconciliation();
    expect(report.quantity.find((row) => row.productId === quantityProduct.id)).toMatchObject({
      onHand: 7,
      consignmentQty: 2,
      ownedPhysicalQty: 5,
      layerQty: 5,
      inventoryValue: 5000,
      layerValue: 5000,
      consistent: true,
    });
    expect(report.serialized.find((row) => row.productId === serializedProduct.id)).toMatchObject({
      units: 2,
      inventoryValue: 3000,
      missingCostUnits: 1,
    });
    expect(report.serialized.find((row) => row.productId === quantityProduct.id)).toBeUndefined();
    expect(report.summary).toMatchObject({
      quantityValue: baseline.summary.quantityValue + 5000,
      serializedValue: baseline.summary.serializedValue + 3000,
      ownedInventoryValue: baseline.summary.ownedInventoryValue + 8000,
      glInventoryBalance: baseline.summary.glInventoryBalance + 8000,
      difference: baseline.summary.difference,
      missingSerializedCostUnits: baseline.summary.missingSerializedCostUnits + 1,
      complete: false,
      consistent: false,
    });

    await prisma.deviceUnit.update({
      where: { imei: `${run}-OWNED-MISSING` },
      data: { acquisitionCost: 2000 },
    });
    await postInventoryDebit(2000, 'missing-cost');
    const completed = await inventory.valuationReconciliation();
    expect(completed.summary.missingSerializedCostUnits).toBe(baseline.summary.missingSerializedCostUnits);
    expect(completed.summary.difference).toBe(baseline.summary.difference);
  });

  async function postInventoryDebit(amount: number, ref: string) {
    await prisma.accountingJournalEntry.create({
      data: {
        idempotencyKey: `${sourceType}:${ref}`,
        sourceType,
        sourceRef: ref,
        description: 'Inventory reconciliation fixture',
        occurredAt: new Date(),
        createdBy: 'test',
        lines: {
          create: [
            { accountCode: '1200', debit: amount },
            { accountCode: '3000', credit: amount },
          ],
        },
      },
    });
  }
});
