import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AiModule } from '../src/ai/ai.module';
import { AuditModule } from '../src/audit/audit.module';
import { OrdersModule } from '../src/orders/orders.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportsModule } from '../src/reports/reports.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { ApprovalsService } from '../src/approvals/approvals.service';

describe('Reports and AI RBAC', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  const jwt = new JwtService({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' });
  const RUN = Math.floor(Math.random() * 1_000_000);
  let adminToken: string;
  let ownerToken: string;
  let sellerToken: string;
  let warehouseToken: string;
  let adminId: string;
  let ownerId: string;
  let approvals: ApprovalsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        ReportsModule,
        AiModule,
        OrdersModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);
    approvals = moduleRef.get(ApprovalsService);

    const createSession = async (role: 'admin' | 'owner' | 'seller' | 'warehouse') => {
      const username = `${role}-reports-ai-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      const token = (await staffAuth.login(username, 'pass')).accessToken;
      return { id: staff.id, token };
    };

    const admin = await createSession('admin');
    adminId = admin.id;
    adminToken = admin.token;
    const owner = await createSession('owner');
    ownerId = owner.id;
    ownerToken = owner.token;
    sellerToken = (await createSession('seller')).token;
    warehouseToken = (await createSession('warehouse')).token;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.aiRun.deleteMany();
    await prisma.approval.deleteMany({ where: { action: 'ai_support_triage' } });
    await prisma.auditEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.cashShift.deleteMany();
  });

  function customerToken(customer: { id: string; phone: string }) {
    return jwt.sign({ sub: customer.id, typ: 'customer', phone: customer.phone });
  }

  it('guards owner reports and AI endpoints behind owner/admin staff permissions', async () => {
    await request(app.getHttpServer()).get('/reports/dashboard').expect(401);
    await request(app.getHttpServer())
      .get('/reports/dashboard')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/reports/dashboard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer()).get('/ai/insights').expect(401);
    await request(app.getHttpServer())
      .get('/ai/insights')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/ai/insights')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/ai/categorize')
      .send({ name: 'iPhone 15 128GB' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/ai/categorize')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'iPhone 15 128GB' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/ai/grade-photos')
      .send({ photos: [{ label: 'front' }] })
      .expect(401);
    await request(app.getHttpServer())
      .post('/ai/grade-photos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ photos: [{ label: 'front' }, { label: 'back' }, { label: 'screen-on' }] })
      .expect(201)
      .expect((res) => {
        expect(res.body.source).toBe('rules');
        expect(res.body.grade).toBe('A');
      });

    await request(app.getHttpServer())
      .post('/ai/price-scout')
      .send({ name: 'iPhone 15', basePrice: 109900 })
      .expect(401);
    await request(app.getHttpServer())
      .post('/ai/price-scout')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'iPhone 15', basePrice: 109900, observedListings: [{ price: 101000 }, { price: 103000 }] })
      .expect(201)
      .expect((res) => {
        expect(res.body.source).toBe('rules');
        expect(res.body.recommendedPrice).toBeGreaterThan(0);
      });
  });

  it('blocks reports and financial AI insights while the caller has an open drawer', async () => {
    await prisma.cashShift.create({
      data: { staffId: adminId, point: 'BISHKEK-1', openCash: 5_000 },
    });

    await request(app.getHttpServer())
      .get('/reports/dashboard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/reports/ledger?type=payment.received')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/ai/insights')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });

  it('runs the audited control plane only for global-read roles and keeps the tool read-only', async () => {
    await request(app.getHttpServer())
      .post('/ai/orchestrator/runs')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ tool: 'insights', intent: 'seller_probe', surface: 'erp' })
      .expect(403);

    const response = await request(app.getHttpServer())
      .post('/ai/orchestrator/runs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tool: 'risk_signals', intent: 'owner_risk_review', surface: 'erp' })
      .expect(201);

    expect(response.body.runId).toEqual(expect.any(String));
    expect(response.body.status).toBe('completed');
    expect(response.body.decision.requiresApproval).toBe(false);
    expect(response.body.decision.sourceRefs).toContain(response.body.runId);
    expect(response.body.output).toEqual(expect.objectContaining({ signals: expect.any(Array) }));

    const run = await prisma.aiRun.findUnique({ where: { id: response.body.runId }, include: { steps: true, decisions: true } });
    expect(run?.status).toBe('completed');
    expect(run?.steps.some((step) => step.kind === 'tool_call' && step.toolName === 'risk_signals')).toBe(true);
    expect(await prisma.auditEvent.findFirst({ where: { type: 'ai.run_completed', refs: { has: response.body.runId } } })).not.toBeNull();

    const replay = await request(app.getHttpServer())
      .get(`/ai/orchestrator/runs/${response.body.runId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(replay.body.id).toBe(response.body.runId);
  });

  it('honors the AI kill switch before creating a run', async () => {
    const previous = process.env.AI_KILL_SWITCH;
    process.env.AI_KILL_SWITCH = '1';
    try {
      await request(app.getHttpServer())
        .post('/ai/orchestrator/runs')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tool: 'risk_signals', intent: 'kill_switch_probe', surface: 'erp' })
        .expect(403);
      expect(await prisma.aiRun.count({ where: { intent: 'kill_switch_probe' } })).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.AI_KILL_SWITCH;
      else process.env.AI_KILL_SWITCH = previous;
    }
  });

  it('triages a support ticket into a reviewable draft without changing ticket state', async () => {
    const customer = await prisma.customer.create({ data: { phone: `+996700${RUN}91`, name: 'AI Support Customer' } });
    const ticket = await prisma.supportTicket.create({
      data: {
        customerId: customer.id,
        channel: 'web',
        subject: 'Телефон не работает после покупки',
        body: 'Нужна гарантия и ремонт, срочно.',
        priority: 'normal',
        sla: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const response = await request(app.getHttpServer())
      .post('/ai/orchestrator/runs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tool: 'support_triage', ticketId: ticket.id, intent: 'triage_ticket', surface: 'erp' })
      .expect(201);

    expect(response.body.output).toEqual(expect.objectContaining({
      category: 'warranty',
      suggestedPriority: 'urgent',
      requiresHumanReview: true,
    }));
    expect(response.body.decision.requiresApproval).toBe(true);
    expect(response.body.decision.approvalId).toEqual(expect.any(String));
    const pending = await prisma.approval.findUnique({ where: { id: response.body.decision.approvalId } });
    expect(pending).toMatchObject({ action: 'ai_support_triage', status: 'requested', sourceRef: response.body.decision.id });
    const approved = await approvals.decide(response.body.decision.approvalId, {
      status: 'approved', approver: ownerId, approverRole: 'owner',
    });
    expect(approved?.status).toBe('approved');
    expect((await prisma.aiDecision.findUnique({ where: { id: response.body.decision.id } }))?.status).toBe('approved');
    const replay = await request(app.getHttpServer())
      .get(`/ai/orchestrator/runs/${response.body.runId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(replay.body.decisions[0]).toEqual(expect.objectContaining({
      id: response.body.decision.id,
      approvalId: response.body.decision.approvalId,
      approvalStatus: 'approved',
    }));
    const unchanged = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(unchanged.status).toBe('new');
    expect(unchanged.priority).toBe('normal');
  });

  it('keeps order timeline ledger scoped to the owning customer or staff queue readers', async () => {
    const owner = await prisma.customer.create({
      data: { phone: `+996700${RUN}11`, name: 'Ledger Owner' },
    });
    const other = await prisma.customer.create({
      data: { phone: `+996700${RUN}12`, name: 'Ledger Other' },
    });
    const order = await prisma.order.create({
      data: { customerId: owner.id, channel: 'web', total: 1000, status: 'created' },
    });
    await prisma.auditEvent.create({
      data: {
        type: 'order.created',
        actor: 'system',
        payload: { orderId: order.id },
        refs: [order.id],
      },
    });

    await request(app.getHttpServer()).get(`/orders/${order.id}/ledger`).expect(401);
    await request(app.getHttpServer())
      .get(`/orders/${order.id}/ledger`)
      .set('Authorization', `Bearer ${customerToken(other)}`)
      .expect(404);

    const customerRes = await request(app.getHttpServer())
      .get(`/orders/${order.id}/ledger`)
      .set('Authorization', `Bearer ${customerToken(owner)}`)
      .expect(200);
    expect(customerRes.body).toHaveLength(1);
    expect(customerRes.body[0].type).toBe('order.created');

    await request(app.getHttpServer())
      .get(`/orders/${order.id}/ledger`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/orders/${order.id}/ledger`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .expect(200);
  });
});
