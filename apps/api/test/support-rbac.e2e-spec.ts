import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { SupportModule } from '../src/support/support.module';

describe('Support CRM RBAC split', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let adminToken: string;
  let adminId: string;
  let sellerToken: string;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
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

  it('keeps customer ticket open/list public but guards CRM inbox actions', async () => {
    const customer = await customerFixture();

    const opened = await request(app.getHttpServer())
      .post('/support/tickets')
      .send({
        customerId: customer.id,
        channel: 'web',
        subject: 'Need help',
        actor: 'spoof',
      })
      .expect(201);

    const created = await prisma.auditEvent.findFirst({ where: { type: 'ticket.created' } });
    expect(created?.actor).toBe(customer.id);

    await request(app.getHttpServer())
      .get(`/support/tickets?customerId=${customer.id}`)
      .expect(200);

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
