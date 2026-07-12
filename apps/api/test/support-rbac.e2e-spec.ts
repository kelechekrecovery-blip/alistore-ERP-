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
import { issueGuestCheckoutCapability } from '../src/auth/guest-capability';

describe('Support CRM RBAC split', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let jwt: JwtService;
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
});
