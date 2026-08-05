import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { SupportModule } from '../src/support/support.module';
import { SupportController } from '../src/support/support.controller';
import { issueGuestCheckoutCapability, requireGuestCapability } from '../src/auth/guest-capability';

describe('Support CRM RBAC split', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let jwt: JwtService;
  let supportController: SupportController;
  let adminToken: string;
  let adminId: string;
  let sellerToken: string;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        SupportModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);
    jwt = moduleRef.get(JwtService);
    supportController = moduleRef.get(SupportController);

    const createSession = async (role: 'admin' | 'seller') => {
      const username = `${role}-support-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      const token = (await staffAuth.login(username, 'pass')).accessToken;
      return { id: staff.id, token };
    };

    const admin = await createSession('admin');
    adminId = admin.id;
    adminToken = admin.token;

    const seller = await createSession('seller');
    sellerToken = seller.token;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.supportTicket.deleteMany();
    await prisma.debtPlan.deleteMany();
    await prisma.warrantyCase.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function customerFixture() {
    return prisma.customer.create({
      data: { phone: `+996704${RUN}`, name: 'Support RBAC' },
    });
  }

  function customerToken(customerId: string, phone: string) {
    return jwt.sign({ sub: customerId, typ: 'customer', phone });
  }

  it('keeps customer ticket open public but scopes ticket reads to owner/staff', async () => {
    const customer = await customerFixture();
    const otherCustomer = await prisma.customer.create({
      data: { phone: `+996705${RUN}`, name: 'Other Support RBAC' },
    });

    const opened = await request(app.getHttpServer())
      .post('/support/tickets')
      .set('x-guest-capability', issueGuestCheckoutCapability(customer.id))
      .send({
        customerId: customer.id,
        channel: 'web',
        subject: 'Need help',
        actor: 'spoof',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/support/tickets')
      .set('x-guest-capability', issueGuestCheckoutCapability(otherCustomer.id))
      .send({ customerId: customer.id, channel: 'web', subject: 'Spoofed owner' })
      .expect(403);

    const created = await prisma.auditEvent.findFirst({ where: { type: 'ticket.created' } });
    expect(created?.actor).toBe(customer.id);

    await request(app.getHttpServer())
      .get(`/support/tickets?customerId=${customer.id}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/support/tickets?customerId=${customer.id}`)
      .set('Authorization', `Bearer ${customerToken(customer.id, customer.phone)}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/support/tickets?customerId=${customer.id}`)
      .set('Authorization', `Bearer ${customerToken(otherCustomer.id, otherCustomer.phone)}`)
      .expect(403);

    await request(app.getHttpServer()).get('/support/tickets').expect(403);
    await request(app.getHttpServer())
      .get('/support/tickets')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/support/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/support/tickets/${opened.body.id}/transition`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ to: 'in_progress', actor: 'spoof' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/support/tickets/${opened.body.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ to: 'in_progress', actor: 'spoof' })
      .expect(200);

    const transitioned = await prisma.auditEvent.findFirst({ where: { type: 'ticket.in_progress' } });
    expect(transitioned?.actor).toBe(adminId);

    await request(app.getHttpServer())
      .patch(`/support/tickets/${opened.body.id}/escalate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ actor: 'spoof' })
      .expect(200);

    const escalated = await prisma.auditEvent.findFirst({ where: { type: 'ticket.escalated' } });
    expect(escalated?.actor).toBe(adminId);
  });

  it('opens and lists native customer tickets with owner scope and exact idempotent replay', async () => {
    const customer = await customerFixture();
    const otherCustomer = await prisma.customer.create({
      data: { phone: `+996706${RUN}`, name: 'Other Native Support' },
    });
    const token = customerToken(customer.id, customer.phone);
    const payload = { channel: 'app', subject: 'Нужна помощь', body: 'Заказ не обновляется' };

    await request(app.getHttpServer())
      .post('/support/tickets/mine')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(400);

    const calls = await Promise.all([
      request(app.getHttpServer()).post('/support/tickets/mine').set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `native-support-${RUN}`).send(payload),
      request(app.getHttpServer()).post('/support/tickets/mine').set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `native-support-${RUN}`).send(payload),
    ]);
    expect(calls.map((call) => call.status)).toEqual([201, 201]);
    expect(calls[0].body.id).toBe(calls[1].body.id);

    await request(app.getHttpServer())
      .post('/support/tickets/mine')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `native-support-${RUN}`)
      .send({ ...payload, subject: 'Другой вопрос' })
      .expect(409);

    const mine = await request(app.getHttpServer())
      .get('/support/tickets/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].customerId).toBe(customer.id);

    const otherMine = await request(app.getHttpServer())
      .get('/support/tickets/mine')
      .set('Authorization', `Bearer ${customerToken(otherCustomer.id, otherCustomer.phone)}`)
      .expect(200);
    expect(otherMine.body).toEqual([]);
    expect(await prisma.auditEvent.count({ where: { type: 'ticket.created' } })).toBe(1);
  });

  it('atomically creates and exactly replays a guest customer support attempt', async () => {
    const canonicalPhone = `+996707${RUN}`;
    const phone = canonicalPhone.slice(1);
    const payload = {
      phone,
      name: 'Guest Support',
      channel: 'web',
      subject: 'Нужна консультация',
      body: 'Не получается оформить заказ',
      priority: 'normal',
    };

    await request(app.getHttpServer())
      .post('/support/tickets/guest')
      .send(payload)
      .expect(400);

    const calls = await Promise.all([
      request(app.getHttpServer()).post('/support/tickets/guest')
        .set('Idempotency-Key', `guest-support-${RUN}`).send(payload),
      request(app.getHttpServer()).post('/support/tickets/guest')
        .set('Idempotency-Key', `guest-support-${RUN}`).send(payload),
    ]);
    expect(calls.map((call) => call.status)).toEqual([201, 201]);
    expect(calls[0].body.ticket.id).toBe(calls[1].body.ticket.id);
    expect(calls[0].body.ticket.customerId).toBe(calls[1].body.ticket.customerId);
    expect(calls[0].body.capabilityExpiresIn).toBeGreaterThan(0);
    expect(calls[0].body.capabilityExpiresIn).toBeLessThanOrEqual(1800);
    expect(requireGuestCapability(calls[0].body.guestCapability, 'support:create').sub)
      .toBe(calls[0].body.ticket.customerId);
    expect(requireGuestCapability(calls[1].body.guestCapability, 'evidence:write').sub)
      .toBe(calls[0].body.ticket.customerId);
    expect(() => requireGuestCapability(calls[0].body.guestCapability, 'orders:create')).toThrow();

    await request(app.getHttpServer())
      .post('/support/tickets/guest')
      .set('Idempotency-Key', `guest-support-${RUN}`)
      .send({ ...payload, subject: 'Другой вопрос' })
      .expect(409);

    expect(await prisma.customer.count({ where: { phone: canonicalPhone } })).toBe(1);
    expect(await prisma.customer.count({ where: { phone } })).toBe(0);
    expect(await prisma.supportTicket.count({ where: { customerId: calls[0].body.ticket.customerId } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'ticket.created' } })).toBe(1);

    expect(await prisma.supportTicket.count({ where: { customerId: calls[0].body.ticket.customerId } })).toBe(1);
  });

  it('rejects a no-plus guest alias for an existing canonical customer', async () => {
    const canonicalPhone = `+996708${RUN}`;
    await prisma.customer.create({ data: { phone: canonicalPhone, name: 'Existing Customer' } });
    const payload = { channel: 'web', subject: 'Alias attempt', body: 'Must authenticate' };

    await request(app.getHttpServer())
      .post('/support/tickets/guest')
      .set('Idempotency-Key', `guest-alias-${RUN}`)
      .send({ ...payload, phone: canonicalPhone.slice(1) })
      .expect(409);

    expect(await prisma.customer.count()).toBe(1);
    expect(await prisma.supportTicket.count()).toBe(0);
  });

  it('caps replay capability to the remaining window and rejects an expired replay', async () => {
    const key = `guest-window-${RUN}`;
    const payload = {
      phone: `996709${RUN}`,
      name: 'Replay Window',
      channel: 'web' as const,
      subject: 'Проверка окна',
      body: 'Не продлевать capability',
      priority: 'normal',
    };
    const created = await supportController.openGuest(key, payload);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    await prisma.supportTicket.update({
      where: { id: created.ticket.id },
      data: { createdAt: tenMinutesAgo },
    });

    const replay = await supportController.openGuest(key, payload);
    expect(replay.ticket.id).toBe(created.ticket.id);
    expect(replay.capabilityExpiresIn).toBeGreaterThanOrEqual(19 * 60);
    expect(replay.capabilityExpiresIn).toBeLessThanOrEqual(20 * 60);
    const claims = requireGuestCapability(replay.guestCapability, 'evidence:read');
    expect((claims.exp ?? 0) - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(20 * 60);

    await prisma.supportTicket.update({
      where: { id: created.ticket.id },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });
    await expect(supportController.openGuest(key, payload)).rejects.toMatchObject({
      code: 'guest_support_replay_expired',
    });
  });
});
