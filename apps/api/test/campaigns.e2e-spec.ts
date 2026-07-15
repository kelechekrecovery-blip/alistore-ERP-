import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ApprovalsModule } from '../src/approvals/approvals.module';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { AuditModule } from '../src/audit/audit.module';
import { CampaignsModule } from '../src/campaigns/campaigns.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Campaigns lifecycle, consent, spend and ROI', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let approvals: ApprovalsService;
  let marketerToken: string;
  let marketerId: string;
  let ownerToken: string;
  let ownerId: string;
  let sellerToken: string;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        ApprovalsModule,
        CampaignsModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);
    approvals = moduleRef.get(ApprovalsService);

    const marketer = await staffAuth.createStaff(`marketer-campaign-${RUN}`, 'pass', 'marketer');
    marketerId = marketer.id;
    marketerToken = (await staffAuth.login(marketer.username, 'pass')).accessToken;
    const owner = await staffAuth.createStaff(`owner-campaign-${RUN}`, 'pass', 'owner');
    ownerId = owner.id;
    ownerToken = (await staffAuth.login(owner.username, 'pass')).accessToken;
    const seller = await staffAuth.createStaff(`seller-campaign-${RUN}`, 'pass', 'seller');
    sellerToken = (await staffAuth.login(seller.username, 'pass')).accessToken;
  });

  afterAll(async () => app.close());

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.campaignSpendEntry.deleteMany();
    await prisma.campaignRefundAdjustment.deleteMany();
    await prisma.campaignFunnelEvent.deleteMany();
    await prisma.orderAttribution.deleteMany();
    await prisma.outboxMessage.deleteMany();
    await prisma.campaignRecipient.deleteMany();
    await prisma.campaign.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.orderBundleAllocation.deleteMany();
    await prisma.orderQuantityAllocation.deleteMany();
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

  async function createDraft(channel: 'whatsapp' | 'telegram' = 'whatsapp', budget = 10_000) {
    return request(app.getHttpServer())
      .post('/campaigns')
      .set('Authorization', `Bearer ${marketerToken}`)
      .send({
        level: channel === 'telegram' ? 'vip' : 'gold',
        city: channel === 'telegram' ? undefined : 'Бишкек',
        minSpent: 50_000,
        channel,
        budget,
        creativeHeadline: 'VIP аксессуары −10%',
        creativeBody: 'Предложение для клиентов AliStore',
        destinationUrl: '/catalog?category=accessories',
      })
      .expect(201);
  }

  async function submitAndApprove(campaignId: string) {
    const submitted = await request(app.getHttpServer())
      .post(`/campaigns/${campaignId}/submit`)
      .set('Authorization', `Bearer ${marketerToken}`)
      .send({})
      .expect(201);
    await expect(approvals.decide(submitted.body.approvalId, {
      status: 'approved', approver: marketerId, approverRole: 'owner',
    })).rejects.toMatchObject({ code: 'four_eye_approval_required' });
    await approvals.decide(submitted.body.approvalId, {
      status: 'approved', approver: ownerId, approverRole: 'owner',
    });
    return submitted.body.approvalId as string;
  }

  it('requires approval before delivery, tracks actual spend, ROI and budget auto-pause', async () => {
    const eligible = await customerWithSpend('001', {
      consent: true, spent: 80_000, segments: ['gold', 'city:Бишкек'],
    });
    const optedOut = await customerWithSpend('002', {
      consent: false, spent: 90_000, segments: ['gold', 'city:Бишкек'],
    });
    await customerWithSpend('003', {
      consent: true, spent: 10_000, segments: ['gold', 'city:Бишкек'],
    });

    await request(app.getHttpServer()).post('/campaigns/preview').send({ level: 'gold' }).expect(401);
    await request(app.getHttpServer())
      .post('/campaigns/preview').set('Authorization', `Bearer ${sellerToken}`).send({ level: 'gold' }).expect(403);
    const preview = await request(app.getHttpServer())
      .post('/campaigns/preview')
      .set('Authorization', `Bearer ${marketerToken}`)
      .send({ level: 'gold', city: 'Бишкек', minSpent: 50_000 })
      .expect(200);
    expect(preview.body).toMatchObject({ matchedCustomers: 2, eligibleCustomers: 1, excludedNoConsent: 1 });

    const created = await createDraft();
    expect(created.body).toMatchObject({ queued: 0, campaign: { status: 'draft', budget: 10_000 } });
    expect(await prisma.outboxMessage.count()).toBe(0);
    const journeyId = '8b0a8fdc-5ce8-449e-8686-5d5c684ff131';
    await request(app.getHttpServer())
      .post('/campaigns/funnel')
      .send({ trackingCode: created.body.campaign.trackingCode, journeyId, stage: 'click' })
      .expect(202, { accepted: true, recorded: false });

    await request(app.getHttpServer())
      .post(`/campaigns/${created.body.campaign.id}/submit`)
      .set('Authorization', `Bearer ${sellerToken}`).send({}).expect(403);
    await submitAndApprove(created.body.campaign.id);
    const activated = await request(app.getHttpServer())
      .post(`/campaigns/${created.body.campaign.id}/activate`)
      .set('Authorization', `Bearer ${marketerToken}`).send({}).expect(201);
    expect(activated.body).toMatchObject({ queued: 1, campaign: { status: 'active' } });

    const outbox = await prisma.outboxMessage.findMany();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      campaignId: created.body.campaign.id,
      recipient: eligible.customer.phone,
      status: 'pending',
    });
    expect(outbox[0].recipient).not.toBe(optedOut.customer.phone);

    await request(app.getHttpServer())
      .post('/campaigns/funnel')
      .send({ trackingCode: created.body.campaign.trackingCode, journeyId, stage: 'visit' })
      .expect(202, { accepted: true, recorded: true });
    await request(app.getHttpServer())
      .post(`/campaigns/${created.body.campaign.id}/conversions`)
      .set('Authorization', `Bearer ${marketerToken}`).send({ orderId: eligible.order.id }).expect(200);
    await request(app.getHttpServer())
      .post(`/campaigns/${created.body.campaign.id}/conversions`)
      .set('Authorization', `Bearer ${marketerToken}`).send({ orderId: eligible.order.id }).expect(200);

    const spend = {
      idempotencyKey: '145f3322-377e-4ec2-b3fb-bc4db254735d',
      provider: 'meta_ads', externalRef: `invoice-${RUN}`, amount: 10_000,
      occurredAt: '2026-07-15T08:00:00.000Z',
    };
    await request(app.getHttpServer())
      .post(`/campaigns/${created.body.campaign.id}/spend`)
      .set('Authorization', `Bearer ${marketerToken}`).send(spend).expect(403);
    const reconciled = await request(app.getHttpServer())
      .post(`/campaigns/${created.body.campaign.id}/spend`)
      .set('Authorization', `Bearer ${ownerToken}`).send(spend).expect(201);
    expect(reconciled.body).toMatchObject({
      spend: 10_000,
      revenue: 80_000,
      contribution: 70_000,
      roas: 8,
      roiPct: 700,
      campaign: { status: 'paused' },
      delivery: { pending: 0, cancelled: 1 },
    });
    await request(app.getHttpServer())
      .post(`/campaigns/${created.body.campaign.id}/spend`)
      .set('Authorization', `Bearer ${ownerToken}`).send(spend).expect(201);
    expect(await prisma.campaignSpendEntry.count()).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'campaign.converted' } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'campaign.budget_exhausted' } })).toBe(1);
  });

  it('supports rejection and routes an approved Telegram campaign to a chat id', async () => {
    await customerWithSpend('004', {
      consent: true, spent: 50_000, segments: ['vip', 'telegram:777004'],
    });
    const rejectedDraft = await createDraft('telegram', 1_000);
    const rejectedSubmit = await request(app.getHttpServer())
      .post(`/campaigns/${rejectedDraft.body.campaign.id}/submit`)
      .set('Authorization', `Bearer ${marketerToken}`).send({}).expect(201);
    await approvals.decide(rejectedSubmit.body.approvalId, {
      status: 'rejected', approver: ownerId, approverRole: 'owner', reason: 'Скорректируйте оффер',
    });
    expect(await prisma.campaign.findUnique({ where: { id: rejectedDraft.body.campaign.id } }))
      .toMatchObject({ status: 'draft', rejectionReason: 'Скорректируйте оффер' });

    const approvedDraft = await createDraft('telegram', 1_000);
    await submitAndApprove(approvedDraft.body.campaign.id);
    await request(app.getHttpServer())
      .post(`/campaigns/${approvedDraft.body.campaign.id}/activate`)
      .set('Authorization', `Bearer ${marketerToken}`).send({}).expect(201);
    expect(await prisma.outboxMessage.findFirst({ where: { campaignId: approvedDraft.body.campaign.id } }))
      .toMatchObject({ channel: 'telegram', recipient: '777004', template: 'campaign_offer' });
  });
});
