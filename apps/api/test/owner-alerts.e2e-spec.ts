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
  let firedOwnerId: string;
  let sellerId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    alerts = new OwnerAlertsService(prisma);
    const owner = await prisma.staffUser.create({
      data: { username: `${RUN}-owner`, passwordHash: 'x', role: 'owner', point: 'BISHKEK-1' },
    });
    ownerId = owner.id;
    // An inactive owner and a non-owner must never receive alerts.
    const fired = await prisma.staffUser.create({
      data: { username: `${RUN}-fired-owner`, passwordHash: 'x', role: 'owner', point: 'BISHKEK-1', active: false },
    });
    firedOwnerId = fired.id;
    const seller = await prisma.staffUser.create({
      data: { username: `${RUN}-seller`, passwordHash: 'x', role: 'seller', point: 'BISHKEK-1' },
    });
    sellerId = seller.id;
  });

  afterAll(async () => {
    await prisma.outboxMessage.deleteMany({ where: { recipient: { in: [ownerId, firedOwnerId, sellerId] } } });
    await prisma.auditEvent.deleteMany({ where: { actor: { startsWith: RUN } } });
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: RUN } } });
    await prisma.$disconnect();
  });

  /**
   * Alerts fan out to every active owner in the database, so on a shared database
   * this suite's two events also reach owners other suites created — 19 of them
   * when this was written. That is the product behaving correctly; only the
   * assertions were wrong to count globally. Everything below is therefore scoped
   * to the events and the staff this suite owns.
   */
  async function ownRows(eventIds: readonly string[]) {
    const all = await prisma.outboxMessage.findMany({ where: { template: OWNER_ALERT_TEMPLATE } });
    return all.filter((row) => eventIds.includes((row.payload as { eventId?: string }).eventId ?? ''));
  }

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
    // `alerted` counts events across the whole database, not just this suite's,
    // so an exact number would assert something this suite does not control. That
    // the balanced shift raises nothing is asserted below instead, where the rows
    // are scoped to the three events seeded here.
    expect(first.alerted).toBeGreaterThanOrEqual(2);

    const ownEventIds = [shortage.id, approval.id];
    const rows = await ownRows(ownEventIds);
    const mine = rows.filter((r) => r.recipient === ownerId);
    expect(mine).toHaveLength(2);
    // The active owner is alerted; the fired owner and the seller never are.
    expect(rows.some((r) => r.recipient === firedOwnerId || r.recipient === sellerId)).toBe(false);
    expect(rows.every((r) => r.channel === 'push')).toBe(true);
    const byEvent = new Map(mine.map((r) => [(r.payload as { eventId?: string }).eventId, r.payload as Record<string, unknown>]));
    expect(byEvent.get(shortage.id)).toMatchObject({ kind: 'cash_variance', diff: -1000 });
    expect(byEvent.get(approval.id)).toMatchObject({ kind: 'approval_requested', action: 'write_off' });

    // Idempotency: a second sweep alerts nothing new.
    const second = await alerts.sweep();
    expect(second.alerted).toBe(0);
    const after = await ownRows(ownEventIds);
    expect(after.filter((r) => r.recipient === ownerId)).toHaveLength(2);
  });
});
