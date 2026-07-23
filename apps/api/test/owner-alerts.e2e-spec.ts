import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { OwnerAlertsService, OWNER_ALERT_TEMPLATE } from '../src/owner-alerts/owner-alerts.service';
import { EventType } from '../src/audit/event-types';

/**
 * Owner business alerts. The ledger already records cash variance and parked
 * dangerous actions; this sweep must turn exactly the alertable ones into
 * Outbox push messages for every active owner — once per event, ever.
 */
describe('OwnerAlertsService.sweep', () => {
  let prisma: PrismaService;
  let alerts: OwnerAlertsService;
  const RUN = `oa-${Math.floor(Math.random() * 1_000_000)}`;
  let ownerId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    alerts = new OwnerAlertsService(prisma);
    const owner = await prisma.staffUser.create({
      data: { username: `${RUN}-owner`, passwordHash: 'x', role: 'owner' },
    });
    ownerId = owner.id;
    // An inactive owner and a non-owner must never receive alerts.
    await prisma.staffUser.create({
      data: { username: `${RUN}-fired-owner`, passwordHash: 'x', role: 'owner', active: false },
    });
    await prisma.staffUser.create({
      data: { username: `${RUN}-seller`, passwordHash: 'x', role: 'seller' },
    });
  });

  afterAll(async () => {
    await prisma.outboxMessage.deleteMany({ where: { template: OWNER_ALERT_TEMPLATE } });
    await prisma.auditEvent.deleteMany({ where: { actor: { startsWith: RUN } } });
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: RUN } } });
    await prisma.$disconnect();
  });

  function seedEvent(type: string, payload: Prisma.InputJsonValue) {
    return prisma.auditEvent.create({
      data: { type, actor: `${RUN}-cashier`, payload, refs: [] },
    });
  }

  it('alerts active owners about cash variance and parked approvals, once per event', async () => {
    const shortage = await seedEvent(EventType.ShiftClosed, { shiftId: 's1', expected: 10000, closeCash: 9000, diff: -1000 });
    await seedEvent(EventType.ShiftClosed, { shiftId: 's2', expected: 5000, closeCash: 5000, diff: 0 });
    const approval = await seedEvent(EventType.ApprovalRequested, { approvalId: 'a1', action: 'write_off' });

    const first = await alerts.sweep();
    expect(first.alerted).toBe(2);

    const rows = await prisma.outboxMessage.findMany({ where: { template: OWNER_ALERT_TEMPLATE } });
    expect(rows).toHaveLength(2);
    // Every alert goes to the active owner only.
    expect(new Set(rows.map((r) => r.recipient))).toEqual(new Set([ownerId]));
    expect(rows.every((r) => r.channel === 'push')).toBe(true);
    const byEvent = new Map(rows.map((r) => [(r.payload as { eventId?: string }).eventId, r.payload as Record<string, unknown>]));
    expect(byEvent.get(shortage.id)).toMatchObject({ kind: 'cash_variance', diff: -1000 });
    expect(byEvent.get(approval.id)).toMatchObject({ kind: 'approval_requested', action: 'write_off' });

    // Idempotency: a second sweep alerts nothing new.
    const second = await alerts.sweep();
    expect(second.alerted).toBe(0);
    expect(await prisma.outboxMessage.count({ where: { template: OWNER_ALERT_TEMPLATE } })).toBe(2);
  });
});
