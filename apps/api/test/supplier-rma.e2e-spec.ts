import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { SupplierRmaService } from '../src/suppliers/supplier-rma.service';
import { ReportsService } from '../src/reports/reports.service';
import { ValidationError } from '../src/common/errors';

/**
 * Supplier RMA (Phase 9): return a defective unit to its supplier, walk the guarded
 * status machine (unit → in_repair → resolution effect), derive the scorecard, and
 * surface an overdue open RMA in the Risk Center.
 */
describe('Supplier RMA (integration)', () => {
  let prisma: PrismaService;
  let rma: SupplierRmaService;
  let reports: ReportsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    rma = new SupplierRmaService(prisma, new AuditService(prisma));
    reports = new ReportsService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.supplierRma.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.warrantyCase.deleteMany();
    await prisma.approval.deleteMany();
  });

  async function fixture() {
    seq += 1;
    const supplier = await prisma.supplier.create({ data: { name: `Supplier-${seq}` } });
    const product = await prisma.product.create({
      data: { sku: `RMA-${seq}`, name: 'x', price: 1, cost: 1, category: 'c', attrs: {} },
    });
    const imei = `RMA-${seq}-1`;
    await prisma.deviceUnit.create({ data: { imei, productId: product.id, status: 'in_stock', location: 'B' } });
    return { supplier, imei };
  }

  it('opens an RMA and sends the unit in_repair', async () => {
    const { supplier, imei } = await fixture();
    const opened = await rma.open({ supplierId: supplier.id, imei, defect: 'DOA' }, 'wh');
    expect(opened.status).toBe('created');
    expect(opened.sla.getTime()).toBeGreaterThan(Date.now());

    const unit = await prisma.deviceUnit.findUnique({ where: { imei } });
    expect(unit?.status).toBe('in_repair');

    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toContain('rma.opened');
  });

  it('walks created→shipped→accepted→repaired→closed and returns the unit to stock', async () => {
    const { supplier, imei } = await fixture();
    const opened = await rma.open({ supplierId: supplier.id, imei, defect: 'no power' }, 'wh');
    await rma.transition(opened.id, 'shipped', 'wh');
    await rma.transition(opened.id, 'accepted', 'wh');
    const repaired = await rma.transition(opened.id, 'repaired', 'wh');
    expect(repaired.resolution).toBe('repaired');
    expect((await prisma.deviceUnit.findUnique({ where: { imei } }))?.status).toBe('in_stock');

    const closed = await rma.transition(opened.id, 'closed', 'wh');
    expect(closed.status).toBe('closed');
    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['rma.shipped', 'rma.resolved', 'rma.closed']));
  });

  it('writes the unit off when the RMA is refunded', async () => {
    const { supplier, imei } = await fixture();
    const opened = await rma.open({ supplierId: supplier.id, imei, defect: 'irreparable' }, 'wh');
    await rma.transition(opened.id, 'shipped', 'wh');
    await rma.transition(opened.id, 'accepted', 'wh');
    await rma.transition(opened.id, 'refunded', 'wh');
    expect((await prisma.deviceUnit.findUnique({ where: { imei } }))?.status).toBe('written_off');
  });

  it('rejects an illegal transition (created → repaired)', async () => {
    const { supplier, imei } = await fixture();
    const opened = await rma.open({ supplierId: supplier.id, imei, defect: 'x' }, 'wh');
    const err = await rma.transition(opened.id, 'repaired', 'wh').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('illegal_rma_transition');
  });

  it('builds a scorecard with resolution rate per supplier', async () => {
    const { supplier, imei } = await fixture();
    // one resolved (repaired), one rejected → resolutionRate 0.5
    const a = await rma.open({ supplierId: supplier.id, imei, defect: 'a' }, 'wh');
    await rma.transition(a.id, 'shipped', 'wh');
    await rma.transition(a.id, 'accepted', 'wh');
    await rma.transition(a.id, 'repaired', 'wh');

    const product = await prisma.product.findFirst();
    await prisma.deviceUnit.create({ data: { imei: `${imei}-b`, productId: product!.id, status: 'in_stock', location: 'B' } });
    const b = await rma.open({ supplierId: supplier.id, imei: `${imei}-b`, defect: 'b' }, 'wh');
    await rma.transition(b.id, 'shipped', 'wh');
    await rma.transition(b.id, 'rejected', 'wh');

    const scores = await rma.scorecard();
    const row = scores.find((s) => s.supplierId === supplier.id);
    expect(row).toMatchObject({ total: 2, resolved: 1, rejected: 1, open: 0, resolutionRate: 0.5 });
  });

  it('surfaces an overdue open RMA in the Risk Center', async () => {
    const { supplier, imei } = await fixture();
    await prisma.supplierRma.create({
      data: { supplierId: supplier.id, imei, defect: 'x', status: 'shipped', sla: new Date(Date.now() - 60_000) },
    });
    const r = await reports.risks();
    expect(r.signals.map((s) => s.kind)).toContain('rma_sla_breach');
  });
});
