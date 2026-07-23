import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

/**
 * STAFF-004: the owner could create and deactivate staff but not run the rest
 * of the lifecycle — promote/demote (role change), bring a deactivated account
 * back, or reset a forgotten password. Each mutation is owner-gated
 * (staff:manage), lands in the ledger, and password reset revokes the target's
 * refresh tokens so a stolen session dies with the old password.
 */
describe('Staff admin lifecycle: role change, reactivation, password reset', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let ownerToken: string;
  let sellerToken: string;
  const RUN = `sal-${Math.floor(Math.random() * 1_000_000)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);

    await staffAuth.createStaff(`${RUN}-owner`, 'owner-pass', 'owner');
    await staffAuth.createStaff(`${RUN}-senior`, 'senior-pass', 'senior_seller');
    ownerToken = (await staffAuth.login(`${RUN}-owner`, 'owner-pass')).accessToken;
    sellerToken = (await staffAuth.login(`${RUN}-senior`, 'senior-pass')).accessToken;
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { type: { in: ['staff.role_changed', 'staff.reactivated', 'staff.password_reset'] } } });
    await prisma.refreshToken.deleteMany({ where: { customerId: { contains: RUN } } });
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: RUN } } });
    await app.close();
  });

  async function makeStaff(suffix: string, role: 'seller' | 'owner' = 'seller') {
    return staffAuth.createStaff(`${RUN}-${suffix}`, 'pw-12345', role);
  }

  it('denies role change to non-owners (staff:manage)', async () => {
    const target = await makeStaff('rbac-target');
    await request(app.getHttpServer())
      .patch(`/staff-auth/staff/${target.id}/role`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ role: 'senior_seller' })
      .expect(403);
  });

  it('owner changes a role and the ledger records from/to', async () => {
    const target = await makeStaff('promote');
    const res = await request(app.getHttpServer())
      .patch(`/staff-auth/staff/${target.id}/role`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'senior_seller' })
      .expect(200);
    expect(res.body.role).toBe('senior_seller');
    expect(res.body.passwordHash).toBeUndefined();

    const event = await prisma.auditEvent.findFirst({
      where: { type: 'staff.role_changed', refs: { has: target.id } },
    });
    expect(event?.payload).toMatchObject({ from: 'seller', to: 'senior_seller' });
  });

  it('refuses to demote the last active owner', async () => {
    const owners = await prisma.staffUser.findMany({ where: { role: 'owner', active: true } });
    // Deactivate every owner except ours so the guard has exactly one left.
    for (const other of owners.filter((o) => o.username !== `${RUN}-owner`)) {
      await prisma.staffUser.update({ where: { id: other.id }, data: { active: false } });
    }
    try {
      const me = await prisma.staffUser.findUniqueOrThrow({ where: { username: `${RUN}-owner` } });
      const res = await request(app.getHttpServer())
        .patch(`/staff-auth/staff/${me.id}/role`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'seller' })
        .expect(409);
      expect(res.body.code).toBe('last_owner_protected');
    } finally {
      for (const other of owners.filter((o) => o.username !== `${RUN}-owner`)) {
        await prisma.staffUser.update({ where: { id: other.id }, data: { active: true } });
      }
    }
  });

  it('owner reactivates a deactivated account, idempotently', async () => {
    const target = await makeStaff('rehire');
    await staffAuth.deactivateStaff('test-admin', target.id);

    const res = await request(app.getHttpServer())
      .post(`/staff-auth/staff/${target.id}/reactivate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    expect(res.body.active).toBe(true);

    // Second call is a no-op, and exactly one ledger event exists.
    await request(app.getHttpServer())
      .post(`/staff-auth/staff/${target.id}/reactivate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    expect(await prisma.auditEvent.count({ where: { type: 'staff.reactivated', refs: { has: target.id } } })).toBe(1);
  });

  it('password reset kills the old password and the old refresh session', async () => {
    const target = await makeStaff('lost-pw');
    await staffAuth.login(`${RUN}-lost-pw`, 'pw-12345');

    await request(app.getHttpServer())
      .post(`/staff-auth/staff/${target.id}/password-reset`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ password: 'brand-new-pw-9' })
      .expect(201);

    await expect(staffAuth.login(`${RUN}-lost-pw`, 'pw-12345')).rejects.toThrow();
    const relogin = await staffAuth.login(`${RUN}-lost-pw`, 'brand-new-pw-9');
    expect(relogin.accessToken).toBeTruthy();

    // Old refresh sessions are revoked; the ledger has the reset without the password.
    const live = await prisma.refreshToken.findMany({
      where: { customerId: { contains: target.id }, revokedAt: null },
    });
    expect(live).toHaveLength(1); // only the fresh post-reset login survives
    const event = await prisma.auditEvent.findFirst({ where: { type: 'staff.password_reset', refs: { has: target.id } } });
    expect(event).toBeTruthy();
    expect(JSON.stringify(event?.payload)).not.toContain('brand-new-pw-9');
  });
});
