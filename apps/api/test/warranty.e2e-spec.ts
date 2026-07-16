import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { WarrantyService } from '../src/warranty/warranty.service';
import { ReportsService } from '../src/reports/reports.service';
import { ConflictError, ValidationError } from '../src/common/errors';

/**
 * WarrantyCase (Phase 9): open a case for a sold IMEI with an SLA, advance through
 * the guarded status machine, and surface SLA-breached open cases in the Risk Center.
 */
describe('Warranty (integration)', () => {
  let prisma: PrismaService;
  let warranty: WarrantyService;
  let reports: ReportsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    warranty = new WarrantyService(prisma, new AuditService(prisma));
    reports = new ReportsService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // FK-safe wipe (payments/items/orders before customers) so leftover rows from
    // a prior suite — jest suite order varies — never block the customer/product wipe.
    await prisma.auditEvent.deleteMany();
    await prisma.warrantyOpenCommand.deleteMany();
    await prisma.loanerLoan.deleteMany();
    await prisma.servicePart.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.serviceWorkOrderCommand.deleteMany();
    await prisma.serviceWorkOrder.deleteMany();
    await prisma.warrantyCase.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.approval.deleteMany();
  });

  async function device() {
    seq += 1;
    const customer = await prisma.customer.create({ data: { phone: `+9967003${seq.toString().padStart(4, '0')}`, name: 'T' } });
    const product = await prisma.product.create({
      data: { sku: `WR-${seq}`, name: 'x', price: 1, cost: 1, category: 'c', attrs: {} },
    });
    const imei = `WR-${seq}-1`;
    const order = await prisma.order.create({
      data: { customerId: customer.id, channel: 'web', total: 1, status: 'paid' },
    });
    await prisma.deviceUnit.create({ data: { imei, productId: product.id, status: 'sold', location: 'B', orderId: order.id } });
    return { customer, imei };
  }

  it('opens a case with an SLA and advances through the machine', async () => {
    const { customer, imei } = await device();
    const wc = await warranty.open({ imei, customerId: customer.id, problem: 'не заряжается' }, 'staff');
    expect(wc.status).toBe('created');
    expect(wc.sla.getTime()).toBeGreaterThan(Date.now());

    await warranty.transition(wc.id, 'received', 'staff');
    await warranty.transition(wc.id, 'diagnostics', 'staff');
    const approved = await warranty.transition(wc.id, 'approved', 'staff');
    expect(approved.status).toBe('approved');
    const repaired = await warranty.transition(wc.id, 'repaired', 'staff');
    expect(repaired.status).toBe('repaired');

    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toContain('warranty.created');
    expect(types).toContain('warranty.closed'); // repaired is a closing status
  });

  it('rejects an illegal transition (422)', async () => {
    const { customer, imei } = await device();
    const wc = await warranty.open({ imei, customerId: customer.id, problem: 'x' }, 'staff');
    const err = await warranty.transition(wc.id, 'closed', 'staff').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('illegal_warranty_transition');
  });

  it('rejects another customer IMEI and replays an exact idempotent open once', async () => {
    const { customer, imei } = await device();
    const other = await prisma.customer.create({ data: { phone: `+9967013${seq.toString().padStart(4, '0')}`, name: 'Other' } });

    const denied = await warranty.open({ imei, customerId: other.id, problem: 'чужое устройство' }, other.id, 'warranty-denied').catch((error) => error);
    expect(denied).toBeInstanceOf(ValidationError);
    expect(denied.code).toBe('device_not_owned');

    const first = await warranty.open({ imei, customerId: customer.id, problem: 'экран' }, customer.id, 'warranty-once');
    const replay = await warranty.open({ imei, customerId: customer.id, problem: 'экран' }, customer.id, 'warranty-once');
    expect(replay.id).toBe(first.id);
    const reused = await warranty.open({ imei, customerId: customer.id, problem: 'другая проблема' }, customer.id, 'warranty-once').catch((error) => error);
    expect(reused).toBeInstanceOf(ConflictError);
    expect(reused.code).toBe('idempotency_key_reused');
    expect(await prisma.warrantyCase.count({ where: { imei } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'warranty.created' } })).toBe(1);
  });

  it('surfaces an SLA-breached open case in the Risk Center', async () => {
    const { customer, imei } = await device();
    await prisma.warrantyCase.create({
      data: { imei, customerId: customer.id, problem: 'x', status: 'diagnostics', sla: new Date(Date.now() - 60_000) },
    });
    const r = await reports.risks();
    expect(r.signals.map((s) => s.kind)).toContain('warranty_sla_breach');
  });

  it('serializes concurrent opens with different keys to one active case', async () => {
    const { customer, imei } = await device();
    const attempts = await Promise.allSettled([
      warranty.open({ imei, customerId: customer.id, problem: 'батарея' }, customer.id, 'warranty-race-a'),
      warranty.open({ imei, customerId: customer.id, problem: 'батарея' }, customer.id, 'warranty-race-b'),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    expect(await prisma.warrantyCase.count({ where: { imei } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'warranty.created' } })).toBe(1);
  });
});
