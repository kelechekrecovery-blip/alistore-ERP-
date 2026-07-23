import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { AuthzModule } from '../src/authz/authz.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { StoreOperationsModule } from '../src/store-operations/store-operations.module';

/**
 * `store_operations:read` is held by seller, cashier, warehouse, service and
 * courier — i.e. everyone standing in a store. `overview()` took no principal and
 * filtered by point only when the caller supplied one, so any of them could read
 * every checklist and every free-text incident of the WHOLE network by simply
 * omitting `?point=`. This is the same missing per-point isolation that got the
 * `franchise` role retired (schema.prisma comment on the Role enum) — the role
 * was removed, the leak was not. Staff are now pinned to their own point;
 * admin/owner may still ask for another one explicitly.
 */
describe('Store Operations overview is scoped to the caller point', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sellerAToken: string;
  let ownerToken: string;
  const run = Math.floor(Math.random() * 1_000_000);
  const pointA = `SCOPE-A-${run}`;
  const pointB = `SCOPE-B-${run}`;
  const businessDate = '2026-07-18';
  const usernames: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, AuthzModule, StaffAuthModule, StoreOperationsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const auth = moduleRef.get(StaffAuthService);
    const session = async (role: 'owner' | 'seller', label: string, point: string) => {
      const username = `${role}-scope-${label}-${run}`;
      usernames.push(username);
      await auth.createStaff(username, 'pass', role, point);
      return (await auth.login(username, 'pass')).accessToken;
    };
    sellerAToken = await session('seller', 'a', pointA);
    ownerToken = await session('owner', 'owner', pointA);

    // One incident per point, created straight through Prisma so the test does
    // not depend on the (separately scoped) write path.
    for (const point of [pointA, pointB]) {
      await prisma.storeIncident.create({
        data: {
          point,
          businessDate: new Date(`${businessDate}T00:00:00.000Z`),
          category: 'safety',
          severity: 'critical',
          title: `incident-${point}`,
          description: `секрет точки ${point}`,
          status: 'open',
          createdBy: 'test',
          idempotencyKey: `scope-${point}`,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.storeIncident.deleteMany({ where: { point: { in: [pointA, pointB] } } });
    await prisma.storeOperationChecklist.deleteMany({ where: { point: { in: [pointA, pointB] } } });
    await prisma.staffUser.deleteMany({ where: { username: { in: usernames } } });
    await app.close();
  });

  it('never returns another point to a seller, with or without an explicit filter', async () => {
    // No filter at all — the leak path. Must come back scoped to the seller's own point.
    const mine = await request(app.getHttpServer())
      .get(`/store-operations/overview?date=${businessDate}`)
      .set('Authorization', `Bearer ${sellerAToken}`)
      .expect(200);
    expect(mine.body.point).toBe(pointA);
    const titles = (mine.body.incidents as Array<{ point: string }>).map((item) => item.point);
    expect(titles).toContain(pointA);
    expect(titles).not.toContain(pointB);
    expect(JSON.stringify(mine.body)).not.toContain(`секрет точки ${pointB}`);

    // Explicitly asking for a foreign point must be refused, not silently honoured.
    await request(app.getHttpServer())
      .get(`/store-operations/overview?point=${pointB}&date=${businessDate}`)
      .set('Authorization', `Bearer ${sellerAToken}`)
      .expect(403);
  });

  it('lets an owner read another point explicitly', async () => {
    const res = await request(app.getHttpServer())
      .get(`/store-operations/overview?point=${pointB}&date=${businessDate}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.point).toBe(pointB);
    expect((res.body.incidents as Array<{ point: string }>).every((item) => item.point === pointB)).toBe(true);
  });
});
