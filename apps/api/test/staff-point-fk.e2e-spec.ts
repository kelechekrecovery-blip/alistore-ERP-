import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditModule } from '../src/audit/audit.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { ValidationError } from '../src/common/errors';

/**
 * A staff account is bound to a store point, but `StaffUser.point` was a free
 * string: a typo silently detached the employee from every point-scoped report.
 * The point must reference a real `StorePoint`. The FK targets
 * `StorePoint.inventoryLocation` (@unique) — not `code` — because that is the
 * value `point` has always held (default 'BISHKEK-1' == the seeded point's
 * inventoryLocation).
 */
describe('StaffUser.point → StorePoint (integration)', () => {
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  const run = `spf-${Math.floor(Math.random() * 1_000_000)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);
  });

  afterAll(async () => {
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: run } } });
    await prisma.storePoint.deleteMany({ where: { inventoryLocation: { startsWith: `${run}-loc` } } });
    await prisma.$disconnect();
  });

  it('binds to the seeded default point', async () => {
    const staff = await staffAuth.createStaff(`${run}-a`, 'pass', 'seller', 'BISHKEK-1');
    expect(staff.point).toBe('BISHKEK-1');
  });

  it('binds to any existing point by its inventoryLocation', async () => {
    const loc = `${run}-loc-1`;
    await prisma.storePoint.create({
      data: {
        code: `${run}-code-1`,
        name: 'Тестовая точка',
        address: '—',
        inventoryLocation: loc,
        hours: '—',
        createdBy: run,
        idempotencyKey: `${run}:sp:1`,
      },
    });
    const staff = await staffAuth.createStaff(`${run}-b`, 'pass', 'seller', loc);
    expect(staff.point).toBe(loc);
  });

  it('refuses to create a staff bound to a non-existent point', async () => {
    await expect(
      staffAuth.createStaff(`${run}-c`, 'pass', 'seller', `${run}-loc-does-not-exist`),
    ).rejects.toBeInstanceOf(ValidationError);
    const orphan = await prisma.staffUser.findUnique({ where: { username: `${run}-c` } });
    expect(orphan).toBeNull();
  });
});
