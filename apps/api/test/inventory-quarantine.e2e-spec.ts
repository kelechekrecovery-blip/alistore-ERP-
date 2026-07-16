import { ApprovalsService } from '../src/approvals/approvals.service';
import { AuditService } from '../src/audit/audit.service';
import { EventType } from '../src/audit/event-types';
import { InventoryService } from '../src/inventory/inventory.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Serialized inventory quarantine (integration)', () => {
  let prisma: PrismaService;
  let inventory: InventoryService;
  let approvals: ApprovalsService;
  const productIds: string[] = [];
  const quarantineIds: string[] = [];
  const customerIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    approvals = new ApprovalsService(prisma, audit);
    inventory = new InventoryService(prisma, audit, approvals);
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { refs: { hasSome: [...productIds, ...quarantineIds] } } });
    await prisma.inventoryQuarantineCase.deleteMany({ where: { unit: { productId: { in: productIds } } } });
    await prisma.approval.deleteMany({ where: { action: 'quarantine_write_off' } });
    await prisma.serviceWorkOrder.deleteMany({ where: { warrantyCase: { imei: { startsWith: 'QT-' } } } });
    await prisma.warrantyCase.deleteMany({ where: { imei: { startsWith: 'QT-' } } });
    await prisma.inventoryValuationIssue.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.$transaction([
      prisma.accountingJournalLine.deleteMany({
        where: { entry: { sourceType: 'inventory.quarantine.write_off', sourceRef: { in: quarantineIds } } },
      }),
      prisma.accountingJournalEntry.deleteMany({
        where: { sourceType: 'inventory.quarantine.write_off', sourceRef: { in: quarantineIds } },
      }),
    ]);
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.return.deleteMany({ where: { order: { customerId: { in: customerIds } } } });
    await prisma.order.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.deviceUnit.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await prisma.$disconnect();
  });

  async function createCase(label: string, acquisitionCost = 70_000) {
    const suffix = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const product = await prisma.product.create({
      data: {
        sku: `QT-${suffix}`,
        name: `Quarantine ${label}`,
        price: 100_000,
        cost: acquisitionCost,
        category: 'phones',
        attrs: {},
      },
    });
    productIds.push(product.id);
    const customer = await prisma.customer.create({
      data: { phone: `+9967${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, '0')}`, name: 'Quarantine customer' },
    });
    customerIds.push(customer.id);
    const order = await prisma.order.create({ data: { customerId: customer.id, channel: 'web', total: 100_000, status: 'paid' } });
    const ret = await prisma.return.create({ data: { orderId: order.id, reason: 'customer return', status: 'reconciled' } });
    const unit = await prisma.deviceUnit.create({
      data: {
        imei: `QT-${suffix}-IMEI`,
        productId: product.id,
        status: 'returned',
        location: 'RETURNS',
        acquisitionCost,
      },
    });
    const quarantine = await prisma.inventoryQuarantineCase.create({
      data: {
        unitId: unit.id,
        returnId: ret.id,
        sourceType: 'return',
        reason: 'customer return',
        unitCost: acquisitionCost,
        createdBy: 'returns-clerk',
      },
    });
    quarantineIds.push(quarantine.id);
    return { product, unit, quarantine, ret };
  }

  async function attachDiagnosisEvidence(id: string, actor: string) {
    await prisma.auditEvent.create({
      data: {
        type: EventType.EvidenceAttached,
        actor: `staff:${actor}`,
        payload: {
          entityType: 'quarantine',
          entityId: id,
          label: 'quarantine_diagnosis',
          trustedStaffEvidence: true,
        },
        refs: [id],
      },
    });
  }

  it('requires trusted evidence and a second employee before restocking', async () => {
    const { unit, quarantine } = await createCase('restock');

    await expect(inventory.diagnoseQuarantine(quarantine.id, { diagnosis: 'resellable' }, 'diagnostician'))
      .rejects.toMatchObject({ code: 'quarantine_evidence_required' });
    await attachDiagnosisEvidence(quarantine.id, 'diagnostician');

    const diagnosed = await inventory.diagnoseQuarantine(
      quarantine.id,
      { diagnosis: 'resellable', notes: '  Пломбы и корпус целы  ' },
      'diagnostician',
    );
    expect(diagnosed).toMatchObject({ status: 'diagnosed', diagnosis: 'resellable', notes: 'Пломбы и корпус целы' });
    await expect(inventory.disposeQuarantine(quarantine.id, { disposition: 'restock' }, 'diagnostician'))
      .rejects.toMatchObject({ code: 'quarantine_four_eyes_required' });
    await expect(inventory.disposeQuarantine(quarantine.id, { disposition: 'repair' }, 'warehouse-lead'))
      .rejects.toMatchObject({ code: 'quarantine_disposition_mismatch' });

    const disposed = await inventory.disposeQuarantine(quarantine.id, { disposition: 'restock' }, 'warehouse-lead');
    const replay = await inventory.disposeQuarantine(quarantine.id, { disposition: 'restock' }, 'warehouse-lead');
    expect(disposed).toMatchObject({ status: 'disposed', disposition: 'restock', disposedBy: 'warehouse-lead' });
    expect(replay.id).toBe(disposed.id);
    expect(await prisma.deviceUnit.findUniqueOrThrow({ where: { id: unit.id } })).toMatchObject({ status: 'in_stock' });
    expect(await prisma.auditEvent.count({ where: { type: EventType.InventoryDisposed, refs: { has: quarantine.id } } })).toBe(1);
  });

  it('routes diagnosed repair stock to service without changing inventory value', async () => {
    const { unit, quarantine } = await createCase('repair');
    await attachDiagnosisEvidence(quarantine.id, 'service-engineer');
    await inventory.diagnoseQuarantine(quarantine.id, { diagnosis: 'repair' }, 'service-engineer');
    const disposed = await inventory.disposeQuarantine(quarantine.id, { disposition: 'repair' }, 'service-lead');

    expect(await prisma.deviceUnit.findUniqueOrThrow({ where: { id: unit.id } })).toMatchObject({ status: 'in_repair' });
    expect(await prisma.inventoryMovement.count({ where: { productId: unit.productId } })).toBe(0);
    expect(await prisma.serviceWorkOrder.count({ where: { id: disposed.repairWorkOrderId } })).toBe(1);
    expect(await prisma.accountingJournalEntry.count({
      where: { sourceType: 'inventory.quarantine.write_off', sourceRef: quarantine.id },
    })).toBe(0);
  });

  it('writes off the exact immutable acquisition cost once', async () => {
    const cost = 73_500;
    const { product, unit, quarantine } = await createCase('write-off', cost);
    await attachDiagnosisEvidence(quarantine.id, 'diagnostician');
    await inventory.diagnoseQuarantine(quarantine.id, { diagnosis: 'write_off' }, 'diagnostician');
    await prisma.deviceUnit.update({ where: { id: unit.id }, data: { acquisitionCost: 1 } });
    const requested = await inventory.disposeQuarantine(quarantine.id, { disposition: 'write_off' }, 'inventory-lead');
    expect(requested).toMatchObject({ status: 'requested' });
    await expect(approvals.decide(requested.approvalId, {
      status: 'approved', approver: 'inventory-lead', approverRole: 'owner',
    })).rejects.toMatchObject({ code: 'four_eye_approval_required' });
    await approvals.decide(requested.approvalId, {
      status: 'approved', approver: 'store-owner', approverRole: 'owner',
    });

    expect(await prisma.deviceUnit.findUniqueOrThrow({ where: { id: unit.id } })).toMatchObject({ status: 'written_off' });
    expect(await prisma.inventoryMovement.findFirstOrThrow({ where: { productId: product.id } })).toMatchObject({
      qty: -1,
      type: 'write_off',
      unitCost: cost,
      totalValue: cost,
    });
    expect(await prisma.inventoryValuationIssue.findFirstOrThrow({ where: { productId: product.id } })).toMatchObject({
      quantity: 1,
      unitCost: cost,
      totalCost: cost,
    });
    const entry = await prisma.accountingJournalEntry.findFirstOrThrow({
      where: { sourceType: 'inventory.quarantine.write_off', sourceRef: quarantine.id },
      include: { lines: true },
    });
    expect(entry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '6900', debit: cost, credit: 0 }),
      expect.objectContaining({ accountCode: '1200', debit: 0, credit: cost }),
    ]));
    expect(await prisma.inventoryMovement.count({ where: { productId: product.id } })).toBe(1);
    expect(await prisma.accountingJournalEntry.count({
      where: { sourceType: 'inventory.quarantine.write_off', sourceRef: quarantine.id },
    })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: EventType.StockWrittenOff, refs: { has: quarantine.id } } })).toBe(1);
  });

  it('allows only one active quarantine case per serialized unit', async () => {
    const { unit, ret } = await createCase('unique-active');
    await expect(prisma.inventoryQuarantineCase.create({
      data: {
        unitId: unit.id,
        returnId: ret.id,
        sourceType: 'exchange',
        reason: 'duplicate active case',
        unitCost: 70_000,
        createdBy: 'other-flow',
      },
    })).rejects.toMatchObject({ code: 'P2002' });
  });
});
