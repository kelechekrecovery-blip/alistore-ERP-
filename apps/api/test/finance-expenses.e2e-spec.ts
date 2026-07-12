import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { FinanceModule } from '../src/finance/finance.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportsModule } from '../src/reports/reports.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Finance expenses (integration + RBAC)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let adminToken: string;
  let ownerToken: string;
  let sellerToken: string;
  let adminId: string;
  let ownerId: string;
  const run = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, FinanceModule, ReportsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);

    const session = async (role: 'admin' | 'owner' | 'seller') => {
      const username = `${role}-finance-${run}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      return { id: staff.id, token: (await staffAuth.login(username, 'pass')).accessToken };
    };
    const admin = await session('admin');
    adminId = admin.id;
    adminToken = admin.token;
    const owner = await session('owner');
    ownerId = owner.id;
    ownerToken = owner.token;
    sellerToken = (await session('seller')).token;
  });

  async function clean() {
    await prisma.expense.deleteMany();
    await prisma.auditEvent.deleteMany({ where: { type: { startsWith: 'expense.' } } });
  }

  beforeEach(clean);
  afterEach(clean);
  afterAll(async () => app.close());

  it('runs submitted → approved → paid with RBAC, concurrency and idempotency', async () => {
    const payload = {
      idempotencyKey: `expense-${run}-1`,
      category: 'rent',
      description: 'Аренда магазина за июль',
      amount: 120_000,
      point: 'BISHKEK-1',
    };

    await request(app.getHttpServer()).post('/finance/expenses').send(payload).expect(401);
    await request(app.getHttpServer()).post('/finance/expenses').set('Authorization', `Bearer ${sellerToken}`).send(payload).expect(403);

    const created = await request(app.getHttpServer())
      .post('/finance/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);
    expect(created.body).toMatchObject({ status: 'submitted', amount: 120_000, requestedBy: adminId });

    const replay = await request(app.getHttpServer())
      .post('/finance/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);
    expect(replay.body).toMatchObject({ id: created.body.id, idempotent: true });
    await request(app.getHttpServer())
      .post('/finance/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...payload, amount: 130_000 })
      .expect(409);

    const concurrent = await Promise.all([
      request(app.getHttpServer()).post(`/finance/expenses/${created.body.id}/approve`).set('Authorization', `Bearer ${ownerToken}`),
      request(app.getHttpServer()).post(`/finance/expenses/${created.body.id}/approve`).set('Authorization', `Bearer ${ownerToken}`),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([201, 409]);

    const paymentPayload = { idempotencyKey: `expense-payment-${run}-1` };
    const paid = await request(app.getHttpServer())
      .post(`/finance/expenses/${created.body.id}/pay`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(paymentPayload)
      .expect(201);
    expect(paid.body).toMatchObject({ status: 'paid', paidBy: ownerId, idempotent: false });

    const paymentReplay = await request(app.getHttpServer())
      .post(`/finance/expenses/${created.body.id}/pay`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(paymentPayload)
      .expect(201);
    expect(paymentReplay.body).toMatchObject({ id: created.body.id, idempotent: true });

    const dashboard = await request(app.getHttpServer())
      .get('/reports/dashboard')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(dashboard.body.money.expenses).toBe(120_000);
    expect(dashboard.body.money.operatingProfit).toBe(
      dashboard.body.money.salesGross - dashboard.body.money.refunds - 120_000,
    );

    const events = await prisma.auditEvent.findMany({ where: { refs: { has: created.body.id } }, orderBy: { ts: 'asc' } });
    expect(events.map((event) => event.type)).toEqual(['expense.submitted', 'expense.approved', 'expense.paid']);
  });

  it('rejects a submitted expense and prevents payment', async () => {
    const created = await request(app.getHttpServer())
      .post('/finance/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `expense-${run}-reject`, category: 'other', description: 'Неподтверждённый расход', amount: 5000 })
      .expect(201);
    const rejected = await request(app.getHttpServer())
      .post(`/finance/expenses/${created.body.id}/reject`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ note: 'Нет подтверждающих документов' })
      .expect(201);
    expect(rejected.body).toMatchObject({ status: 'rejected', rejectionNote: 'Нет подтверждающих документов' });
    await request(app.getHttpServer())
      .post(`/finance/expenses/${created.body.id}/pay`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `expense-payment-${run}-reject` })
      .expect(409);
  });
});
