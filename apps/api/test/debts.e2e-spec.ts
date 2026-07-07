import { DebtPlan } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { DebtsService, DEBT_LIMIT } from '../src/debts/debts.service';
import { ReportsService } from '../src/reports/reports.service';
import { ConflictError, ValidationError } from '../src/common/errors';

/**
 * Debt / installment sales (Phase 9): book a sale on credit, gate debts over the
 * limit through approval, reduce the balance with payments until settled, and flag
 * overdue open debts in the Risk Center.
 */
describe('Debts (integration)', () => {
  let prisma: PrismaService;
  let debts: DebtsService;
  let approvals: ApprovalsService;
  let reports: ReportsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    approvals = new ApprovalsService(prisma, audit);
    debts = new DebtsService(prisma, audit, approvals);
    reports = new ReportsService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.debtPlan.deleteMany();
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
    await prisma.supplierRma.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.approval.deleteMany();
  });

  async function order() {
    seq += 1;
    const customer = await prisma.customer.create({ data: { phone: `+9967005${seq.toString().padStart(4, '0')}`, name: 'D' } });
    const o = await prisma.order.create({
      data: { customerId: customer.id, channel: 'pos', total: 100000, status: 'paid' },
    });
    return { customer, orderId: o.id };
  }

  it('books a debt within the limit and starts balance at principal', async () => {
    const { orderId } = await order();
    const debt = await debts.create({ orderId, principal: 30000, installments: 3 }, 'seller');
    expect(debt).toMatchObject({ principal: 30000, balance: 30000, status: 'open', installments: 3 });
    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toContain('debt.created');
  });

  it('reduces the balance on payment and settles at zero', async () => {
    const { orderId } = await order();
    const debt = (await debts.create({ orderId, principal: 20000 }, 'seller')) as DebtPlan;

    const partial = await debts.pay(debt.id, { amount: 12000 }, 'cashier');
    expect(partial.debt.balance).toBe(8000);
    expect(partial.settled).toBe(false);

    const final = await debts.pay(debt.id, { amount: 8000 }, 'cashier');
    expect(final.debt.balance).toBe(0);
    expect(final.settled).toBe(true);
    expect(final.debt.status).toBe('settled');

    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['debt.payment', 'debt.settled']));
    // installment Payment rows recorded against the order
    const payments = await prisma.payment.findMany({ where: { orderId, method: 'installment' } });
    expect(payments).toHaveLength(2);
  });

  it('rejects a payment over the remaining balance', async () => {
    const { orderId } = await order();
    const debt = (await debts.create({ orderId, principal: 5000 }, 'seller')) as DebtPlan;
    const err = await debts.pay(debt.id, { amount: 6000 }, 'cashier').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('invalid_debt_payment');
  });

  it('rejects paying a settled debt', async () => {
    const { orderId } = await order();
    const debt = (await debts.create({ orderId, principal: 4000 }, 'seller')) as DebtPlan;
    await debts.pay(debt.id, { amount: 4000 }, 'cashier');
    const err = await debts.pay(debt.id, { amount: 1 }, 'cashier').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.code).toBe('debt_not_open');
  });

  it('parks a debt over the limit for approval and books it only once approved', async () => {
    const { orderId } = await order();
    const parked = (await debts.create(
      { orderId, principal: DEBT_LIMIT + 25000, actor: 'seller' },
      'seller',
    )) as { approvalId: string; status: string };
    expect(parked.status).toBe('requested');
    expect(await prisma.debtPlan.count()).toBe(0); // not booked yet

    await approvals.decide(parked.approvalId, { status: 'approved', approver: 'owner', approverRole: 'owner' });
    const booked = await prisma.debtPlan.findMany();
    expect(booked).toHaveLength(1);
    expect(booked[0].principal).toBe(DEBT_LIMIT + 25000);
    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['approval.approved', 'debt.created']));
  });

  it('surfaces an overdue open debt in the Risk Center', async () => {
    const { orderId, customer } = await order();
    await prisma.debtPlan.create({
      data: {
        orderId,
        customerId: customer.id,
        principal: 10000,
        balance: 10000,
        installments: 1,
        dueDate: new Date(Date.now() - 60_000),
        status: 'open',
      },
    });
    const r = await reports.risks();
    expect(r.signals.map((s) => s.kind)).toContain('debt_overdue');
  });
});
