import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { SupportService } from '../src/support/support.service';
import { ReportsService } from '../src/reports/reports.service';
import { ConflictError, ValidationError } from '../src/common/errors';

/**
 * Support Inbox (Phase 10): open tickets from any channel with an SLA derived from
 * priority, walk the guarded status machine, escalate up the priority ladder, and
 * surface overdue open tickets in the Risk Center.
 */
describe('Support tickets (integration)', () => {
  let prisma: PrismaService;
  let support: SupportService;
  let reports: ReportsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    support = new SupportService(prisma, new AuditService(prisma));
    reports = new ReportsService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.supportTicket.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.loanerLoan.deleteMany();
    await prisma.loanerDevice.deleteMany();
    await prisma.serviceWorkOrderCommand.deleteMany();
    await prisma.serviceWorkOrder.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.warrantyCase.deleteMany();
    await prisma.supplierRma.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.debtPlan.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.reservation.deleteMany();
  });

  async function customer() {
    seq += 1;
    return prisma.customer.create({ data: { phone: `+9967006${seq.toString().padStart(4, '0')}`, name: 'S' } });
  }

  it('opens a ticket with an SLA from its priority', async () => {
    const c = await customer();
    const t = await support.open(
      { customerId: c.id, channel: 'whatsapp', subject: 'нет чека', priority: 'high' },
      'agent',
    );
    expect(t.status).toBe('new');
    expect(t.priority).toBe('high');
    expect(t.sla.getTime()).toBeGreaterThan(Date.now());
    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toContain('ticket.created');
  });

  it('walks new→in_progress→resolved→closed', async () => {
    const c = await customer();
    const t = await support.open({ customerId: c.id, channel: 'app', subject: 'x' }, 'agent');
    await support.transition(t.id, 'in_progress', { to: 'in_progress', assignee: 'agent1' }, 'agent1');
    const resolved = await support.transition(t.id, 'resolved', { to: 'resolved' }, 'agent1');
    expect(resolved.status).toBe('resolved');
    const closed = await support.transition(t.id, 'closed', { to: 'closed' }, 'agent1');
    expect(closed.status).toBe('closed');
    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['ticket.in_progress', 'ticket.resolved', 'ticket.closed']));
  });

  it('rejects an illegal transition (new → resolved)', async () => {
    const c = await customer();
    const t = await support.open({ customerId: c.id, channel: 'web', subject: 'x' }, 'agent');
    const err = await support.transition(t.id, 'resolved', { to: 'resolved' }, 'agent').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('illegal_ticket_transition');
  });

  it('escalates up the ladder and refuses past the top', async () => {
    const c = await customer();
    const t = await support.open({ customerId: c.id, channel: 'call', subject: 'x', priority: 'normal' }, 'agent');
    const high = await support.escalate(t.id, 'lead');
    expect(high.priority).toBe('high');
    const urgent = await support.escalate(t.id, 'lead');
    expect(urgent.priority).toBe('urgent');
    expect(urgent.sla.getTime()).toBeLessThan(high.sla.getTime()); // urgent SLA tighter
    const err = await support.escalate(t.id, 'lead').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.code).toBe('ticket_max_priority');
  });

  it('refuses to escalate a resolved ticket', async () => {
    const c = await customer();
    const t = await support.open({ customerId: c.id, channel: 'store', subject: 'x' }, 'agent');
    await support.transition(t.id, 'in_progress', { to: 'in_progress' }, 'agent');
    await support.transition(t.id, 'resolved', { to: 'resolved' }, 'agent');
    const err = await support.escalate(t.id, 'lead').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.code).toBe('ticket_not_escalatable');
  });

  it('surfaces an overdue open ticket in the Risk Center', async () => {
    const c = await customer();
    await prisma.supportTicket.create({
      data: {
        customerId: c.id,
        channel: 'telegram',
        subject: 'просрочка',
        priority: 'urgent',
        sla: new Date(Date.now() - 60_000),
        status: 'in_progress',
      },
    });
    const r = await reports.risks();
    expect(r.signals.map((s) => s.kind)).toContain('ticket_sla_breach');
  });
});
