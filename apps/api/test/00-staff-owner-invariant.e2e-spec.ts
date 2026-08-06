import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../src/audit/audit.service';
import { TotpService } from '../src/auth/totp.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

/** PostgreSQL-backed concurrency coverage for the global staff-owner invariant. */
describe('Staff owner invariant', () => {
  let prisma: PrismaService;
  let service: StaffAuthService;
  const run = `owner-invariant-${process.pid}`;
  const createdStaffIds: string[] = [];
  let firstOwnerId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new StaffAuthService(
      prisma,
      new JwtService({ secret: 'test-secret' }),
      new TotpService(),
      new AuditService(prisma),
    );
  });

  afterAll(async () => {
    if (createdStaffIds.length > 0) {
      await prisma.auditEvent.deleteMany({
        where: {
          type: { in: ['staff.deactivated', 'staff.role_changed'] },
          refs: { hasSome: createdStaffIds },
        },
      });
      await prisma.staffUser.deleteMany({ where: { id: { in: createdStaffIds } } });
    }
    await prisma.$disconnect();
  });

  it('serializes concurrent first-owner bootstrap so exactly one owner is created', async () => {
    expect(await prisma.staffUser.count()).toBe(0);

    const attempts = await Promise.allSettled([
      service.bootstrapOwner(`${run}-first`, 'Str0ng-Pass!26'),
      service.bootstrapOwner(`${run}-second`, 'Str0ng-Pass!26'),
    ]);
    const fulfilled = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<StaffAuthService['bootstrapOwner']>>> =>
        attempt.status === 'fulfilled',
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'staff_already_bootstrapped' });
    expect(await prisma.staffUser.findMany({
      where: { username: { startsWith: run } },
      select: { id: true, role: true, active: true },
    })).toEqual([
      { id: fulfilled[0].value.id, role: 'owner', active: true },
    ]);

    firstOwnerId = fulfilled[0].value.id;
    createdStaffIds.push(firstOwnerId);
  });

  it('refuses to deactivate the last active owner', async () => {
    await expect(service.deactivateStaff('owner-invariant-test', firstOwnerId))
      .rejects.toMatchObject({ code: 'last_owner_protected' });
    await expect(prisma.staffUser.findUniqueOrThrow({ where: { id: firstOwnerId } }))
      .resolves.toMatchObject({ role: 'owner', active: true });
  });

  it('serializes concurrent owner demotion and deactivation so one active owner remains', async () => {
    const secondOwner = await service.createStaff(`${run}-removal`, 'Str0ng-Pass!26', 'owner');
    createdStaffIds.push(secondOwner.id);

    const attempts = await Promise.allSettled([
      service.deactivateStaff('owner-invariant-test', firstOwnerId),
      service.changeRole('owner-invariant-test', secondOwner.id, 'admin'),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === 'rejected',
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'last_owner_protected' });
    await expect(prisma.staffUser.count({ where: { role: 'owner', active: true } }))
      .resolves.toBe(1);
  });
});
