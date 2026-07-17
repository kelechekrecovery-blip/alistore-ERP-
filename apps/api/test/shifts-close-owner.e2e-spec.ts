import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ShiftsService } from '../src/shifts/shifts.service';
import { ConflictError } from '../src/common/errors';

/**
 * LOGIC-005: close() must enforce the same owner-or-manager guard as handover()
 * (shifts.service.ts) — a foreign staff member without a manager role must not
 * close someone else's shift; the owner or an owner/admin role may.
 */
describe('Shift close ownership (integration)', () => {
  let prisma: PrismaService;
  let shifts: ShiftsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    shifts = new ShiftsService(prisma, new AuditService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.refundAllocation.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.cashShiftHandover.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cashShift.deleteMany();
  });

  const staff = () => {
    seq += 1;
    return `close-owner-staff-${seq}`;
  };

  it('rejects a foreign staff member closing the shift (409, same code as handover)', async () => {
    const owner = staff();
    const shift = await shifts.open(
      { staffId: owner, point: 'BISHKEK-1', openCash: 5000 },
      owner,
    );

    const err = await shifts
      .close(shift.id, { closeCash: 5000 }, 'close-owner-stranger', undefined, 'cashier')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('shift_handover_owner_mismatch');

    // the shift stays open and no ledger events are written
    expect((await prisma.cashShift.findUniqueOrThrow({ where: { id: shift.id } })).closedAt).toBeNull();
    expect(await prisma.auditEvent.count({ where: { type: 'shift.closed', refs: { has: shift.id } } })).toBe(0);

    // the owner can still close afterwards
    const closed = await shifts.close(shift.id, { closeCash: 5000 }, owner, undefined, 'cashier');
    expect(closed.diff).toBe(0);
  });

  it('allows the owner to close their own shift', async () => {
    const owner = staff();
    const shift = await shifts.open(
      { staffId: owner, point: 'BISHKEK-1', openCash: 5000 },
      owner,
    );
    const closed = await shifts.close(shift.id, { closeCash: 5000 }, owner, undefined, 'cashier');
    expect(closed.closedAt).not.toBeNull();
    expect(await prisma.auditEvent.count({ where: { type: 'shift.closed', refs: { has: shift.id } } })).toBe(1);
  });

  it.each([['admin'], ['owner']])('allows a manager (%s) to close a foreign shift', async (role) => {
    const owner = staff();
    const shift = await shifts.open(
      { staffId: owner, point: 'BISHKEK-1', openCash: 5000 },
      owner,
    );
    const closed = await shifts.close(shift.id, { closeCash: 5000 }, 'close-owner-manager', undefined, role);
    expect(closed.closedAt).not.toBeNull();
    const event = await prisma.auditEvent.findFirst({
      where: { type: 'shift.closed', refs: { has: shift.id } },
    });
    expect(event?.actor).toBe('close-owner-manager');
  });
});
