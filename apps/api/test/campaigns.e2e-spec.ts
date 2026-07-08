import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { CampaignsModule } from '../src/campaigns/campaigns.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Campaigns (segment builder, consent filter, ROI)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let marketerToken: string;
  let marketerId: string;
  let sellerToken: string;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        CampaignsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);

    const marketer = await staffAuth.createStaff(`marketer-campaign-${RUN}`, 'pass', 'marketer');
    marketerId = marketer.id;
    marketerToken = (await staffAuth.login(marketer.username, 'pass')).accessToken;

    const seller = await staffAuth.createStaff(`seller-campaign-${RUN}`, 'pass', 'seller');
    sellerToken = (await staffAuth.login(seller.username, 'pass')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.outboxMessage.deleteMany();
    await prisma.campaign.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function customerWithSpend(
    suffix: string,
    data: { consent: boolean; spent: number; segments: string[]; ltv?: number },
  ) {
    const customer = await prisma.customer.create({
      data: {
        phone: `+996700${RUN.toString().slice(0, 3)}${suffix}`,
        name: `Campaign ${suffix}`,
        consent: data.consent,
        segments: data.segments,
        ltv: data.ltv ?? data.spent,
      },
    });
    const order = await prisma.order.create({
      data: { customerId: customer.id, channel: 'web', total: data.spent, status: 'paid' },
    });
    await prisma.payment.create({
      data: { orderId: order.id, amount: data.spent, method: 'card', status: 'received' },
    });
    return { customer, order };
  }

  it('previews consent-filtered segments, queues only consenting recipients, and computes idempotent ROI', async () => {
    const eligible = await customerWithSpend('001', {
      consent: true,
      spent: 80000,
      segments: ['gold', 'city:Бишкек', 'telegram:777001'],
    });
    const optedOut = await customerWithSpend('002', {
      consent: false,
      spent: 90000,
      segments: ['gold', 'city:Бишкек'],
    });
    await customerWithSpend('003', {
      consent: true,
      spent: 10000,
      segments: ['gold', 'city:Бишкек'],
    });

    await request(app.getHttpServer())
      .post('/campaigns/preview')
      .send({ level: 'gold', city: 'Бишкек', minSpent: 50000 })
      .expect(401);

    await request(app.getHttpServer())
      .post('/campaigns/preview')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ level: 'gold', city: 'Бишкек', minSpent: 50000 })
      .expect(403);

    const preview = await request(app.getHttpServer())
      .post('/campaigns/preview')
      .set('Authorization', `Bearer ${marketerToken}`)
      .send({ level: 'gold', city: 'Бишкек', minSpent: 50000 })
      .expect(200);

    expect(preview.body).toMatchObject({
      totalCustomers: 3,
      matchedCustomers: 2,
      eligibleCustomers: 1,
      excludedNoConsent: 1,
    });
    expect(preview.body.audience.map((c: { id: string }) => c.id)).toEqual([eligible.customer.id]);

    const created = await request(app.getHttpServer())
      .post('/campaigns')
      .set('Authorization', `Bearer ${marketerToken}`)
      .send({
        level: 'gold',
        city: 'Бишкек',
        minSpent: 50000,
        channel: 'whatsapp',
        budget: 10000,
        message: 'VIP аксессуары −10%',
      })
      .expect(201);

    expect(created.body).toMatchObject({ queued: 1, excludedNoConsent: 1 });

    const outbox = await prisma.outboxMessage.findMany({ orderBy: { createdAt: 'asc' } });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      channel: 'whatsapp',
      recipient: eligible.customer.phone,
      template: 'campaign_offer',
      status: 'pending',
    });
    expect(outbox[0].recipient).not.toBe(optedOut.customer.phone);

    const sent = await prisma.auditEvent.findFirst({ where: { type: 'campaign.sent' } });
    expect(sent?.actor).toBe(marketerId);

    await request(app.getHttpServer())
      .post(`/campaigns/${created.body.campaign.id}/conversions`)
      .set('Authorization', `Bearer ${marketerToken}`)
      .send({ orderId: eligible.order.id })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/campaigns/${created.body.campaign.id}/conversions`)
      .set('Authorization', `Bearer ${marketerToken}`)
      .send({ orderId: eligible.order.id })
      .expect(200);

    const roi = await request(app.getHttpServer())
      .get(`/campaigns/${created.body.campaign.id}/roi`)
      .set('Authorization', `Bearer ${marketerToken}`)
      .expect(200);

    expect(roi.body).toMatchObject({
      orders: 1,
      revenue: 80000,
      budget: 10000,
      profit: 70000,
      roiPct: 700,
    });

    const conversions = await prisma.auditEvent.findMany({ where: { type: 'campaign.converted' } });
    expect(conversions).toHaveLength(1);
  });

  it('queues Telegram campaigns to chat ids stored in customer segments', async () => {
    await customerWithSpend('004', {
      consent: true,
      spent: 50000,
      segments: ['vip', 'telegram:777004'],
    });

    await request(app.getHttpServer())
      .post('/campaigns')
      .set('Authorization', `Bearer ${marketerToken}`)
      .send({
        level: 'vip',
        channel: 'telegram',
        budget: 1000,
        message: 'Telegram VIP offer',
      })
      .expect(201);

    const outbox = await prisma.outboxMessage.findMany();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      channel: 'telegram',
      recipient: '777004',
      template: 'campaign_offer',
    });
  });
});
