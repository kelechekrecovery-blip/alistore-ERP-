import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { authenticator } from 'otplib';
import { ApprovalsModule } from '../src/approvals/approvals.module';
import { AuditModule } from '../src/audit/audit.module';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { CustomersModule } from '../src/customers/customers.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

/**
 * ACCESS-STAFF-BATCH: access-control hardening across three surfaces.
 *  SEC-010   — Approval Inbox reads require the `approvals:read` grant
 *              (senior_seller/admin/owner), and Customer 360 requires
 *              `customers:read` (seller/senior_seller/service/admin/owner);
 *              courier/warehouse/cashier get 403. The existing phone masking
 *              for non-privileged staff is preserved.
 *  STAFF-002 — an owner can reset a staff member's TOTP without the current
 *              code (lost authenticator); the reset writes `staff.totp_reset`
 *              to the ledger in the same transaction.
 *  STAFF-001 — an owner can deactivate a staff account. Open cash shifts and
 *              active courier deliveries block with 409; a clean deactivate
 *              kills logins and JWTs (active-staff guard) and writes
 *              `staff.deactivated`. Re-deactivation is idempotent.
 */
describe('ACCESS-STAFF-BATCH: SEC-010 + STAFF-002 + STAFF-001', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  const RUN = Math.floor(Math.random() * 1_000_000);
  let seq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        PrismaModule,
        AuditModule,
        ApprovalsModule,
        CustomersModule,
        StaffAuthModule,
      ],
      providers: [JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  type StaffRole = 'courier' | 'cashier' | 'seller' | 'senior_seller' | 'service' | 'owner';

  async function staffSession(role: StaffRole) {
    seq += 1;
    const username = `asb-${role}-${RUN}-${seq}`;
    const staff = await staffAuth.createStaff(username, 'pass', role);
    const token = (await staffAuth.login(username, 'pass')).accessToken;
    return { staffId: staff.id, username, token };
  }

  async function customer() {
    seq += 1;
    return prisma.customer.create({
      data: {
        phone: `+9967${String(RUN).padStart(6, '0').slice(0, 6)}${String(seq).padStart(2, '0')}`,
        name: `Access Customer ${RUN}-${seq}`,
      },
    });
  }

  describe('SEC-010: approvals read requires approvals:read', () => {
    it('refuses courier/cashier (403) and anonymous (401); allows senior_seller/owner', async () => {
      const approval = await prisma.approval.create({
        data: { action: 'refund', requester: `seller-${RUN}`, reason: 'access-staff-batch' },
      });
      const server = app.getHttpServer();

      await request(server).get('/approvals').expect(401);

      const courier = await staffSession('courier');
      await request(server)
        .get('/approvals')
        .set('Authorization', `Bearer ${courier.token}`)
        .expect(403);
      await request(server)
        .get(`/approvals/${approval.id}`)
        .set('Authorization', `Bearer ${courier.token}`)
        .expect(403);

      const cashier = await staffSession('cashier');
      await request(server)
        .get('/approvals')
        .set('Authorization', `Bearer ${cashier.token}`)
        .expect(403);

      const seniorSeller = await staffSession('senior_seller');
      await request(server)
        .get('/approvals')
        .set('Authorization', `Bearer ${seniorSeller.token}`)
        .expect(200);

      const owner = await staffSession('owner');
      const detail = await request(server)
        .get(`/approvals/${approval.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);
      expect(detail.body.id).toBe(approval.id);
    });
  });

  describe('SEC-010: Customer 360 requires customers:read (phone mask preserved)', () => {
    it('refuses courier/cashier (403); seller reads with masked phone; owner reads full PII', async () => {
      const c = await customer();
      const server = app.getHttpServer();

      const courier = await staffSession('courier');
      await request(server)
        .get(`/customers/${c.id}`)
        .set('Authorization', `Bearer ${courier.token}`)
        .expect(403);
      await request(server)
        .get(`/customers/${c.id}/overview`)
        .set('Authorization', `Bearer ${courier.token}`)
        .expect(403);

      const cashier = await staffSession('cashier');
      await request(server)
        .get(`/customers/${c.id}/overview`)
        .set('Authorization', `Bearer ${cashier.token}`)
        .expect(403);

      const seller = await staffSession('seller');
      const masked = await request(server)
        .get(`/customers/${c.id}`)
        .set('Authorization', `Bearer ${seller.token}`)
        .expect(200);
      expect(masked.body.phone).not.toBe(c.phone);
      expect(masked.body.phone).toMatch(/^\+996\*+\d{2}$/);

      const maskedOverview = await request(server)
        .get(`/customers/${c.id}/overview`)
        .set('Authorization', `Bearer ${seller.token}`)
        .expect(200);
      expect(maskedOverview.body.customer.phone).not.toBe(c.phone);

      const service = await staffSession('service');
      await request(server)
        .get(`/customers/${c.id}/overview`)
        .set('Authorization', `Bearer ${service.token}`)
        .expect(200);

      const owner = await staffSession('owner');
      const full = await request(server)
        .get(`/customers/${c.id}/overview`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);
      expect(full.body.customer.phone).toBe(c.phone);
    });
  });

  describe('STAFF-002: owner TOTP reset writes the ledger', () => {
    it('refuses cashier (403) and anonymous (401); owner resets without the current code', async () => {
      seq += 1;
      const username = `asb-totp-target-${RUN}-${seq}`;
      const target = await staffAuth.createStaff(username, 'pass', 'cashier');
      const setup = await staffAuth.setupTotp(target.id);
      await staffAuth.enableTotp(target.id, authenticator.generate(setup.secret));

      const cashier = await staffSession('cashier');
      const owner = await staffSession('owner');
      const server = app.getHttpServer();

      await request(server)
        .post(`/staff-auth/staff/${target.id}/totp-reset`)
        .set('Authorization', `Bearer ${cashier.token}`)
        .expect(403);
      await request(server)
        .post(`/staff-auth/staff/${target.id}/totp-reset`)
        .expect(401);

      // No current TOTP code in the body — that is the point of an admin reset.
      const reset = await request(server)
        .post(`/staff-auth/staff/${target.id}/totp-reset`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(201);
      expect(reset.body).toMatchObject({ id: target.id, totpEnabled: false });

      const after = await prisma.staffUser.findUniqueOrThrow({ where: { id: target.id } });
      expect(after.totpEnabled).toBe(false);
      expect(after.totpSecret).toBeNull();

      const event = await prisma.auditEvent.findFirst({
        where: { type: 'staff.totp_reset', refs: { has: target.id } },
      });
      expect(event).not.toBeNull();
      expect(event?.actor).toBe(owner.staffId);
    });
  });

  describe('STAFF-001: staff deactivation with blockers', () => {
    it('blocks on an open shift / active delivery (409), then deactivates cleanly', async () => {
      seq += 1;
      const username = `asb-target-${RUN}-${seq}`;
      const target = await staffAuth.createStaff(username, 'pass', 'cashier');
      const targetToken = (await staffAuth.login(username, 'pass')).accessToken;

      const cashier = await staffSession('cashier');
      const owner = await staffSession('owner');
      const server = app.getHttpServer();

      await request(server)
        .post(`/staff-auth/staff/${target.id}/deactivate`)
        .set('Authorization', `Bearer ${cashier.token}`)
        .expect(403);
      await request(server)
        .post(`/staff-auth/staff/${target.id}/deactivate`)
        .expect(401);

      // Blocker 1: the target has an open cash shift — hand over or close it first.
      const shift = await prisma.cashShift.create({
        data: { staffId: target.id, point: 'BISHKEK-1', openCash: 0 },
      });
      const blockedByShift = await request(server)
        .post(`/staff-auth/staff/${target.id}/deactivate`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(409);
      expect(blockedByShift.body.code).toBe('staff_deactivation_blocked');
      expect(blockedByShift.body.message).toContain(shift.id);

      // Blocker 2: the shift is closed, but the target has an active delivery.
      await prisma.cashShift.update({ where: { id: shift.id }, data: { closedAt: new Date() } });
      const c = await customer();
      const order = await prisma.order.create({
        data: {
          customerId: c.id,
          channel: 'web',
          fulfillmentType: 'courier',
          total: 1000,
          status: 'courier_assigned',
          courierId: target.id,
        },
      });
      const blockedByOrder = await request(server)
        .post(`/staff-auth/staff/${target.id}/deactivate`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(409);
      expect(blockedByOrder.body.code).toBe('staff_deactivation_blocked');
      expect(blockedByOrder.body.message).toContain(order.id);

      // Clean: the delivery is done, so deactivation succeeds in one transaction.
      await prisma.order.update({ where: { id: order.id }, data: { status: 'delivered' } });
      const deactivated = await request(server)
        .post(`/staff-auth/staff/${target.id}/deactivate`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(201);
      expect(deactivated.body).toMatchObject({ id: target.id, active: false });

      // The old JWT is cut immediately (active-staff guard) and login is refused.
      await request(server)
        .get('/staff-auth/me')
        .set('Authorization', `Bearer ${targetToken}`)
        .expect(403);
      await expect(staffAuth.login(username, 'pass')).rejects.toMatchObject({
        code: 'staff_invalid_credentials',
      });

      const event = await prisma.auditEvent.findFirst({
        where: { type: 'staff.deactivated', refs: { has: target.id } },
      });
      expect(event).not.toBeNull();
      expect(event?.actor).toBe(owner.staffId);

      // Re-deactivation is idempotent: same result, no duplicate ledger event.
      const again = await request(server)
        .post(`/staff-auth/staff/${target.id}/deactivate`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(201);
      expect(again.body).toMatchObject({ id: target.id, active: false });
      const events = await prisma.auditEvent.findMany({
        where: { type: 'staff.deactivated', refs: { has: target.id } },
      });
      expect(events).toHaveLength(1);
    });
  });

  /**
   * STAFF-003: деактивация обязана резать и создание сотрудников.
   *
   * `POST /staff-auth/staff` был единственным опасным маршрутом этого
   * контроллера без `ActiveStaffGuard` — у соседних `staff/:id/totp-reset` и
   * `staff/:id/deactivate` он есть. Staff-токен живёт 8 часов и не отзывается,
   * поэтому уволенный владелец до конца этого окна успевал завести себе новую
   * учётку owner. Такая учётка переживает даже ротацию JWT_SECRET — то есть
   * восстановление доступа получается постоянным.
   *
   * Существующая проверка деактивации (выше) смотрит только `GET /staff-auth/me`
   * и потому эту дыру не видела.
   */
  describe('STAFF-003: деактивированный владелец не создаёт сотрудников', () => {
    it('отклоняет создание по ещё живому токену и не оставляет учётку в БД', async () => {
      const server = app.getHttpServer();
      const admin = await staffSession('owner');
      const fired = await staffSession('owner');

      // Токен получен ДО деактивации и остаётся криптографически валидным.
      const firedToken = fired.token;
      await request(server)
        .post(`/staff-auth/staff/${fired.staffId}/deactivate`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(201);

      seq += 1;
      const smuggled = `asb-smuggled-${RUN}-${seq}`;
      await request(server)
        .post('/staff-auth/staff')
        .set('Authorization', `Bearer ${firedToken}`)
        .send({ username: smuggled, password: 'pass', role: 'owner' })
        .expect(403);

      // Отказ должен быть до записи, а не после.
      const leaked = await prisma.staffUser.findUnique({ where: { username: smuggled } });
      expect(leaked).toBeNull();

      // Действующий владелец при этом не задет.
      seq += 1;
      const legitimate = `asb-legit-${RUN}-${seq}`;
      await request(server)
        .post('/staff-auth/staff')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ username: legitimate, password: 'pass', role: 'cashier' })
        .expect(201);
    });
  });
});
