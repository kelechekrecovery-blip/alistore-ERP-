import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditModule } from '../src/audit/audit.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

/**
 * Shift handover needs to know who can receive the drawer, but the cashier handing
 * it over does not have staff:manage (the owner roster). handoverTargets answers
 * exactly that, scoped: active colleagues at the caller's own point, minus self.
 */
describe('Shift handover targets (integration)', () => {
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  const run = `hot-${Math.floor(Math.random() * 1_000_000)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);
  });

  afterAll(async () => {
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: run } } });
    await prisma.$disconnect();
  });

  it('returns active colleagues at the caller point, excluding self, inactive and other points', async () => {
    const caller = await staffAuth.createStaff(`${run}-caller`, 'p', 'cashier', 'BISHKEK-1');
    const colleague = await staffAuth.createStaff(`${run}-colleague`, 'p', 'seller', 'BISHKEK-1');
    const inactive = await staffAuth.createStaff(`${run}-inactive`, 'p', 'seller', 'BISHKEK-1');
    await prisma.staffUser.update({ where: { id: inactive.id }, data: { active: false } });
    await staffAuth.createStaff(`${run}-otherpoint`, 'p', 'seller', 'BISHKEK-2');

    const targets = await staffAuth.handoverTargets('BISHKEK-1', caller.id);
    const ids = targets.map((t) => t.id);

    expect(ids).toContain(colleague.id);
    expect(ids).not.toContain(caller.id); // self excluded
    expect(ids).not.toContain(inactive.id); // inactive excluded
    // Other-point staff never appears.
    const other = await prisma.staffUser.findUnique({ where: { username: `${run}-otherpoint` } });
    expect(ids).not.toContain(other?.id);
    // Minimal shape — no password hash or point leaks.
    expect(targets.find((t) => t.id === colleague.id)).toEqual({ id: colleague.id, username: `${run}-colleague`, role: 'seller' });
  });
});
