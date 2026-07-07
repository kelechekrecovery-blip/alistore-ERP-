import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { CourierService } from '../src/courier/courier.service';
import { ConflictError, ValidationError } from '../src/common/errors';

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
    courier = new CourierService(prisma, new AuditService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  const courierId = () => {
    seq += 1;
    return `courier_${seq}`;
  };

  it('creates a run pending handover and writes delivery.assigned', async () => {
    const run = await courier.createRun({ courierId: courierId(), codTotal: 154900 }, 'dispatcher');
    expect(run.handedOver).toBe(false);
    const evt = await prisma.auditEvent.findFirst({
      where: { type: 'delivery.assigned', refs: { has: run.id } },
    });
    expect(evt).not.toBeNull();
  });

  it('reconciles an exact handover to diff 0 without a shortage', async () => {
    const run = await courier.createRun({ courierId: courierId(), codTotal: 154900 }, 'dispatcher');
    const settled = await courier.handover({ runId: run.id, amount: 154900 }, 'cashier');
    expect(settled.handedOver).toBe(true);
    expect(settled.diff).toBe(0);
    const shortage = await prisma.auditEvent.findFirst({
      where: { type: 'cash.shortage', refs: { has: run.id } },
    });
    expect(shortage).toBeNull();
  });

  it('rejects a short handover without a reason (422), records it with a reason', async () => {
    const run = await courier.createRun({ courierId: courierId(), codTotal: 154900 }, 'dispatcher');

    const err = await courier
      .handover({ runId: run.id, amount: 150000 }, 'cashier')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.getStatus()).toBe(422);
    expect(err.code).toBe('handover_reason_required');

    const settled = await courier.handover(
      { runId: run.id, amount: 150000, reason: 'клиент доплатил картой' },
      'cashier',
    );
    expect(settled.diff).toBe(-4900);
    const shortage = await prisma.auditEvent.findFirst({
      where: { type: 'cash.shortage', refs: { has: run.id } },
    });
    expect(shortage).not.toBeNull();
  });

  it('cannot hand over the same run twice (409)', async () => {
    const run = await courier.createRun({ courierId: courierId(), codTotal: 0 }, 'dispatcher');
    await courier.handover({ runId: run.id, amount: 0 }, 'cashier');
    const err = await courier.handover({ runId: run.id, amount: 0 }, 'cashier').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('cod_already_handed_over');
  });

  it('records a failed delivery in the ledger', async () => {
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967009${seq.toString().padStart(3, '0')}`, name: 'Тест' },
    });
    const order = await prisma.order.create({
      data: { customerId: customer.id, channel: 'app', total: 154900, status: 'out_for_delivery' },
    });
    const res = await courier.failDelivery(
      order.id,
      { reason: 'адрес не найден', evidence: { photo: 'evi-1' } },
      'courier',
    );
    expect(res.recorded).toBe(true);
    const evt = await prisma.auditEvent.findFirst({
      where: { type: 'delivery.failed', refs: { has: order.id } },
    });
    expect(evt).not.toBeNull();
  });
});
