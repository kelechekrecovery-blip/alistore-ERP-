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
    await prisma.financeBudgetCommand.deleteMany();
    await prisma.financeBudget.deleteMany();
    await prisma.$transaction([
      prisma.accountingPeriod.deleteMany(),
      prisma.payment.updateMany({ where: { accountingEntryId: { not: null } }, data: { accountingEntryId: null } }),
      prisma.accountingJournalLine.deleteMany(),
      prisma.accountingJournalEntry.deleteMany(),
    ]);
    await prisma.expense.deleteMany();
    await prisma.auditEvent.deleteMany({ where: { OR: [{ type: { startsWith: 'expense.' } }, { type: { startsWith: 'accounting.' } }, { type: 'finance.budget_set' }] } });
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

    const paymentPayload = { idempotencyKey: `expense-payment-${run}-1`, fundingAccountCode: '1010', paymentReference: 'BANK-001' };
    const paid = await request(app.getHttpServer())
      .post(`/finance/expenses/${created.body.id}/pay`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(paymentPayload)
      .expect(201);
    expect(paid.body).toMatchObject({ status: 'paid', paidBy: ownerId, paymentAccountCode: '1010', paymentReference: 'BANK-001', idempotent: false });
    expect(paid.body.accountingEntryId).toEqual(expect.any(String));

    const paymentReplay = await request(app.getHttpServer())
      .post(`/finance/expenses/${created.body.id}/pay`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(paymentPayload)
      .expect(201);
    expect(paymentReplay.body).toMatchObject({ id: created.body.id, idempotent: true });
    await request(app.getHttpServer())
      .post(`/finance/expenses/${created.body.id}/pay`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...paymentPayload, fundingAccountCode: '1000' })
      .expect(409);

    const journalEntry = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { id: paid.body.accountingEntryId },
      include: { lines: { orderBy: { accountCode: 'asc' } } },
    });
    expect(journalEntry).toMatchObject({ sourceType: 'expense.payment', sourceRef: created.body.id, point: 'BISHKEK-1' });
    expect(journalEntry.lines).toMatchObject([
      { accountCode: '1010', debit: 0, credit: 120_000 },
      { accountCode: '6200', debit: 120_000, credit: 0 },
    ]);

    const now = Date.now();
    const trialBalance = await request(app.getHttpServer())
      .get(`/finance/trial-balance?from=${encodeURIComponent(new Date(now - 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(now + 86_400_000).toISOString())}&point=BISHKEK-1`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(trialBalance.body).toMatchObject({ totalDebit: 120_000, totalCredit: 120_000, balanced: true });
    expect(trialBalance.body.coverage).toMatchObject({
      complete: false,
      sourceTypes: ['expense.payment', 'payment.receipt', 'payment.refund'],
    });
    const journal = await request(app.getHttpServer())
      .get(`/finance/journal?from=${encodeURIComponent(new Date(now - 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(now + 86_400_000).toISOString())}&accountCode=6200`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(journal.body).toHaveLength(1);
    expect(journal.body[0]).toMatchObject({ id: paid.body.accountingEntryId, sourceType: 'expense.payment' });
    await request(app.getHttpServer())
      .get(`/finance/journal?from=${encodeURIComponent(new Date(now + 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(now - 86_400_000).toISOString())}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(422);
    await request(app.getHttpServer())
      .get(`/finance/trial-balance?from=${encodeURIComponent(new Date(now - 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(now + 86_400_000).toISOString())}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);

    const dashboard = await request(app.getHttpServer())
      .get('/reports/dashboard')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(dashboard.body.money.expenses).toBe(120_000);
    expect(dashboard.body.money.operatingProfit).toBe(
      dashboard.body.money.salesGross - dashboard.body.money.refunds - 120_000,
    );

    const events = await prisma.auditEvent.findMany({ where: { refs: { has: created.body.id } }, orderBy: { ts: 'asc' } });
    expect(events.map((event) => event.type)).toEqual(['expense.submitted', 'expense.approved', 'expense.paid', 'accounting.entry_posted']);
  });

  it('closes an accounting period and blocks new postings', async () => {
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const expense = await request(app.getHttpServer())
      .post('/finance/expenses')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `period-expense-${run}`, category: 'rent', description: 'Проверка закрытия периода', amount: 1_000, incurredAt: now.toISOString() })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/finance/periods/${period}/close`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ idempotencyKey: `period-close-forbidden-${run}`, status: 'hard_closed' })
      .expect(403);

    const closed = await request(app.getHttpServer())
      .post(`/finance/periods/${period}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `period-close-${run}`, status: 'hard_closed' })
      .expect(201);
    expect(closed.body.status).toBe('hard_closed');

    const replay = await request(app.getHttpServer())
      .post(`/finance/periods/${period}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `period-close-${run}`, status: 'hard_closed' })
      .expect(201);
    expect(replay.body.idempotent).toBe(true);

    await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/pay`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `period-pay-${run}`, fundingAccountCode: '1000' })
      .expect(409);
  });

  it('exposes supplier AP aging with permission and a stable empty report', async () => {
    await request(app.getHttpServer()).get('/finance/ap-aging').expect(401);
    const report = await request(app.getHttpServer())
      .get('/finance/ap-aging')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(report.body.rows).toEqual([]);
    expect(report.body.totalOutstanding).toBe(0);
    expect(report.body.supplierCount).toBe(0);
    expect(report.body.totals).toMatchObject({ current: 0, '1_30': 0, '90_plus': 0, paid: 0 });
  });

  it('builds financial statements from the journal with reconciliation flags', async () => {
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const response = await request(app.getHttpServer())
      .get(`/finance/statements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(response.body.source).toBe('accounting_journal');
    expect(response.body.balanced).toBe(true);
    expect(response.body.journal.debit).toBe(response.body.journal.credit);
    expect(response.body.balanceSheet.balanced).toBe(true);
    expect(response.body.profitAndLoss.netProfit).toBe(0);
  });

  it('reverses a posted journal entry without mutating the original', async () => {
    const created = await request(app.getHttpServer())
      .post('/finance/expenses')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `reverse-expense-${run}`, category: 'rent', description: 'Расход для сторно', amount: 2_000 })
      .expect(201);
    await request(app.getHttpServer()).post(`/finance/expenses/${created.body.id}/approve`).set('Authorization', `Bearer ${ownerToken}`).expect(201);
    await request(app.getHttpServer()).post(`/finance/expenses/${created.body.id}/pay`).set('Authorization', `Bearer ${ownerToken}`).send({ idempotencyKey: `reverse-pay-${run}`, fundingAccountCode: '1000' }).expect(201);
    const original = await prisma.accountingJournalEntry.findFirstOrThrow({ where: { sourceType: 'expense.payment' }, include: { lines: true } });

    const reversal = await request(app.getHttpServer())
      .post(`/finance/journal/${original.id}/reverse`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `reverse-${run}`, reason: 'Исправление ошибочного расхода' })
      .expect(201);
    expect(reversal.body.reversalOfId).toBe(original.id);
    expect(reversal.body.lines.map((line: { debit: number; credit: number }) => [line.debit, line.credit])).toEqual(original.lines.map((line) => [line.credit, line.debit]));

    const replay = await request(app.getHttpServer()).post(`/finance/journal/${original.id}/reverse`).set('Authorization', `Bearer ${ownerToken}`).send({ idempotencyKey: `reverse-${run}`, reason: 'Исправление ошибочного расхода' }).expect(201);
    expect(replay.body.id).toBe(reversal.body.id);
    expect(await prisma.accountingJournalEntry.count({ where: { reversalOfId: original.id } })).toBe(1);
  });

  it('returns a deterministic conflict when two expenses reuse one payment key', async () => {
    const createApproved = async (suffix: string) => {
      const created = await request(app.getHttpServer())
        .post('/finance/expenses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ idempotencyKey: `expense-${run}-${suffix}`, category: 'other', description: `Расход ${suffix}`, amount: 1000 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/finance/expenses/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);
      return created.body.id as string;
    };
    const [firstId, secondId] = await Promise.all([createApproved('shared-a'), createApproved('shared-b')]);
    const payload = { idempotencyKey: `expense-payment-${run}-shared`, fundingAccountCode: '1000' };
    const firstPayment = await request(app.getHttpServer())
      .post(`/finance/expenses/${firstId}/pay`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(payload)
      .expect(201);
    expect(firstPayment.body).toMatchObject({ status: 'paid', idempotent: false });
    const collision = await request(app.getHttpServer())
      .post(`/finance/expenses/${secondId}/pay`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(payload)
      .expect(409);
    expect(collision.body).toMatchObject({ code: 'accounting_idempotency_conflict' });
    expect(await prisma.accountingJournalEntry.count({ where: { idempotencyKey: payload.idempotencyKey } })).toBe(1);
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
      .send({ idempotencyKey: `expense-payment-${run}-reject`, fundingAccountCode: '1000' })
      .expect(409);
  });

  it('sets an idempotent period budget and reports paid plan-vs-actual by point', async () => {
    const first = {
      idempotencyKey: `budget-${run}-1`,
      period: '2026-07',
      category: 'rent',
      point: 'BISHKEK-1',
      amount: 100_000,
    };
    await request(app.getHttpServer()).post('/finance/budgets').send(first).expect(401);
    await request(app.getHttpServer())
      .post('/finance/budgets')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send(first)
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/finance/budgets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(first)
      .expect(201);
    expect(created.body).toMatchObject({ period: '2026-07', category: 'rent', point: 'BISHKEK-1', amount: 100_000, version: 1, idempotent: false });

    const replay = await request(app.getHttpServer())
      .post('/finance/budgets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(first)
      .expect(201);
    expect(replay.body).toMatchObject({ id: created.body.id, version: 1, idempotent: true });
    await request(app.getHttpServer())
      .post('/finance/budgets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...first, amount: 101_000 })
      .expect(409);

    const updated = await request(app.getHttpServer())
      .post('/finance/budgets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...first, idempotencyKey: `budget-${run}-2`, amount: 110_000 })
      .expect(201);
    expect(updated.body).toMatchObject({ id: created.body.id, amount: 110_000, version: 2, idempotent: false });

    const expense = await request(app.getHttpServer())
      .post('/finance/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        idempotencyKey: `expense-${run}-plan-fact`,
        category: 'rent',
        description: 'Аренда точки за июль',
        amount: 120_000,
        point: 'BISHKEK-1',
        incurredAt: '2026-07-10T00:00:00.000Z',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/pay`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `expense-payment-${run}-plan-fact`, fundingAccountCode: '1010' })
      .expect(201);

    const report = await request(app.getHttpServer())
      .get('/finance/plan-fact?period=2026-07&point=BISHKEK-1')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(report.body).toMatchObject({
      period: '2026-07',
      point: 'BISHKEK-1',
      plan: 110_000,
      actual: 120_000,
      variance: -10_000,
      usagePct: 109.1,
    });
    expect(report.body.rows.find((row: { category: string }) => row.category === 'rent')).toMatchObject({
      plan: 110_000,
      actual: 120_000,
      variance: -10_000,
      usagePct: 109.1,
    });

    const budgets = await request(app.getHttpServer())
      .get('/finance/budgets?period=2026-07&point=BISHKEK-1')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(budgets.body).toHaveLength(1);
    expect(await prisma.auditEvent.count({ where: { type: 'finance.budget_set', refs: { has: created.body.id } } })).toBe(2);
  });

  it('serializes concurrent updates to the same budget without losing a version', async () => {
    const base = { period: '2026-08', category: 'marketing', point: 'BISHKEK-1' };
    const created = await request(app.getHttpServer())
      .post('/finance/budgets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...base, idempotencyKey: `budget-${run}-race-0`, amount: 10_000 })
      .expect(201);

    const updates = await Promise.all([
      request(app.getHttpServer())
        .post('/finance/budgets')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ...base, idempotencyKey: `budget-${run}-race-1`, amount: 20_000 }),
      request(app.getHttpServer())
        .post('/finance/budgets')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ...base, idempotencyKey: `budget-${run}-race-2`, amount: 30_000 }),
    ]);
    expect(updates.map((response) => response.status)).toEqual([201, 201]);
    expect(updates.map((response) => response.body.version).sort()).toEqual([2, 3]);

    const stored = await prisma.financeBudget.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.version).toBe(3);
    expect([20_000, 30_000]).toContain(stored.amount);
    expect(await prisma.financeBudgetCommand.count({ where: { budgetId: stored.id } })).toBe(3);
    expect(await prisma.auditEvent.count({ where: { type: 'finance.budget_set', refs: { has: stored.id } } })).toBe(3);
  });
});
