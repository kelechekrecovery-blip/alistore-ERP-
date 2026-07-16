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
    await prisma.accountingTaxSettlement.deleteMany();
    await prisma.$transaction([
      prisma.cashIncassation.deleteMany(),
      prisma.cashShift.deleteMany(),
      prisma.accountingPeriod.deleteMany(),
      prisma.bankStatement.deleteMany(),
      prisma.payment.updateMany({ where: { accountingEntryId: { not: null } }, data: { accountingEntryId: null } }),
      prisma.debtPlan.updateMany({ where: { accountingEntryId: { not: null } }, data: { accountingEntryId: null } }),
      prisma.purchaseReceipt.updateMany({ where: { accountingEntryId: { not: null } }, data: { accountingEntryId: null } }),
      prisma.supplierInvoice.updateMany({ where: { accountingEntryId: { not: null } }, data: { accountingEntryId: null } }),
      prisma.supplierCreditNote.updateMany({ where: { accountingEntryId: { not: null } }, data: { accountingEntryId: null } }),
      prisma.supplierStatementLine.deleteMany(),
      prisma.supplierStatement.deleteMany(),
      prisma.landedCostAllocation.deleteMany(),
      prisma.landedCost.deleteMany(),
      prisma.supplierInvoiceAdvanceAllocation.deleteMany(),
      prisma.supplierAdvance.deleteMany(),
      prisma.supplierInvoicePayment.deleteMany(),
      prisma.fixedAssetDepreciation.deleteMany(),
      prisma.fixedAsset.deleteMany(),
      prisma.accountingOpeningBalanceLine.deleteMany(),
      prisma.accountingOpeningBalance.deleteMany(),
      prisma.accountingJournalLine.deleteMany(),
      prisma.accountingJournalEntry.deleteMany(),
    ]);
    await prisma.expense.deleteMany();
    await prisma.accountingCurrencyRate.deleteMany();
    await prisma.auditEvent.deleteMany({ where: { OR: [{ type: { startsWith: 'expense.' } }, { type: { startsWith: 'accounting.' } }, { type: { startsWith: 'finance.' } }, { type: 'finance.budget_set' }] } });
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

  it('freezes foreign-currency and input-tax snapshots into the expense journal', async () => {
    const effectiveAt = new Date(Date.now() - 60_000).toISOString();
    const ratePayload = {
      idempotencyKey: `fx-rate-${run}`,
      currency: 'USD',
      rateMicros: 87_500_000,
      effectiveAt,
      source: 'NBKR daily rate',
    };
    await request(app.getHttpServer()).post('/finance/currency-rates').send(ratePayload).expect(401);
    await request(app.getHttpServer()).post('/finance/currency-rates').set('Authorization', `Bearer ${sellerToken}`).send(ratePayload).expect(403);
    const rate = await request(app.getHttpServer())
      .post('/finance/currency-rates')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(ratePayload)
      .expect(201);
    expect(rate.body).toMatchObject({ currency: 'USD', baseCurrency: 'KGS', rateMicros: 87_500_000, source: 'NBKR daily rate', idempotent: false });
    const rateReplay = await request(app.getHttpServer()).post('/finance/currency-rates').set('Authorization', `Bearer ${ownerToken}`).send(ratePayload).expect(201);
    expect(rateReplay.body).toMatchObject({ id: rate.body.id, idempotent: true });

    const rates = await request(app.getHttpServer())
      .get(`/finance/currency-rates?currency=USD&asOf=${encodeURIComponent(new Date().toISOString())}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(rates.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: rate.body.id })]));

    await request(app.getHttpServer())
      .post('/finance/expenses')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `fx-expense-missing-rate-${run}`, category: 'rent', description: 'USD без курса', amount: 1000, currency: 'USD' })
      .expect(422);

    const expense = await request(app.getHttpServer())
      .post('/finance/expenses')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        idempotencyKey: `fx-expense-${run}`,
        category: 'rent',
        description: 'Аренда в USD с входным НДС',
        amount: 1000,
        currency: 'USD',
        exchangeRateId: rate.body.id,
        taxMode: 'included',
        taxRateBps: 1200,
        incurredAt: new Date().toISOString(),
      })
      .expect(201);
    expect(expense.body).toMatchObject({
      documentAmount: 1000,
      currency: 'USD',
      exchangeRateMicros: 87_500_000,
      exchangeRateId: rate.body.id,
      amount: 87_500,
      taxMode: 'included',
      taxCode: 'vat_input',
      taxRateBps: 1200,
      taxBaseAmount: 78_125,
      taxAmount: 9_375,
    });
    await request(app.getHttpServer()).post(`/finance/expenses/${expense.body.id}/approve`).set('Authorization', `Bearer ${ownerToken}`).expect(201);
    const paid = await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/pay`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `fx-expense-pay-${run}`, fundingAccountCode: '1010', paymentReference: 'USD-INVOICE-1' })
      .expect(201);

    const entry = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { id: paid.body.accountingEntryId },
      include: { lines: { orderBy: { accountCode: 'asc' } } },
    });
    expect(entry).toMatchObject({
      currency: 'USD',
      documentAmount: 1000,
      exchangeRateMicros: 87_500_000,
      baseAmount: 87_500,
      taxCode: 'vat_input',
      taxRateBps: 1200,
      taxAmount: 9_375,
    });
    expect(entry.lines).toMatchObject([
      { accountCode: '1010', debit: 0, credit: 87_500 },
      { accountCode: '1210', debit: 9_375, credit: 0 },
      { accountCode: '6200', debit: 78_125, credit: 0 },
    ]);
    expect(await prisma.auditEvent.count({ where: { type: 'finance.currency_rate_recorded', refs: { has: rate.body.id } } })).toBe(1);
  });

  it('soft-closes, settles output/input VAT, then hard-closes the period', async () => {
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const pendingExpense = await request(app.getHttpServer())
      .post('/finance/expenses')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `period-expense-${run}`, category: 'rent', description: 'Проверка закрытия периода', amount: 1_000, incurredAt: now.toISOString() })
      .expect(201);

    const inputTaxExpense = await request(app.getHttpServer())
      .post('/finance/expenses')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `period-tax-expense-${run}`, category: 'rent', description: 'Входящий НДС периода', amount: 56_000, taxMode: 'included', taxRateBps: 1200, incurredAt: now.toISOString() })
      .expect(201);
    await request(app.getHttpServer()).post(`/finance/expenses/${inputTaxExpense.body.id}/approve`).set('Authorization', `Bearer ${ownerToken}`).expect(201);
    await request(app.getHttpServer())
      .post(`/finance/expenses/${inputTaxExpense.body.id}/pay`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `period-tax-expense-pay-${run}`, fundingAccountCode: '1010' })
      .expect(201);

    const outputEntry = await prisma.accountingJournalEntry.create({
      data: {
        idempotencyKey: `period-output-tax-${run}`,
        sourceType: 'payment.receipt',
        sourceRef: `period-sale-${run}`,
        description: 'Продажа с исходящим НДС',
        documentAmount: 112_000,
        baseAmount: 112_000,
        taxCode: 'vat_output:vat_standard',
        taxRateBps: 1200,
        taxAmount: 12_000,
        occurredAt: now,
        createdBy: ownerId,
        lines: { create: [
          { accountCode: '1020', debit: 112_000 },
          { accountCode: '4000', credit: 100_000 },
          { accountCode: '2200', credit: 12_000 },
        ] },
      },
    });

    await request(app.getHttpServer())
      .post(`/finance/periods/${period}/close`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ idempotencyKey: `period-close-forbidden-${run}`, status: 'hard_closed' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/finance/periods/${period}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `period-close-too-early-${run}`, status: 'hard_closed' })
      .expect(409);

    const softClosed = await request(app.getHttpServer())
      .post(`/finance/periods/${period}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `period-soft-close-${run}`, status: 'soft_closed' })
      .expect(201);
    expect(softClosed.body.status).toBe('soft_closed');

    await request(app.getHttpServer())
      .post(`/finance/expenses/${pendingExpense.body.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/finance/expenses/${pendingExpense.body.id}/pay`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `period-pay-${run}`, fundingAccountCode: '1000' })
      .expect(409);

    const report = await request(app.getHttpServer())
      .get(`/finance/tax-periods/${period}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(report.body).toMatchObject({ status: 'soft_closed', outputTax: 12_000, inputTax: 6_000, offsetAmount: 6_000, payableAmount: 6_000, recoverableAmount: 0, settlement: null });

    await request(app.getHttpServer())
      .post(`/finance/tax-periods/${period}/settle`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `period-tax-point-${run}`, point: 'BISHKEK-1' })
      .expect(422);

    const settled = await request(app.getHttpServer())
      .post(`/finance/tax-periods/${period}/settle`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `period-tax-settlement-${run}` })
      .expect(201);
    expect(settled.body).toMatchObject({ outputTax: 12_000, inputTax: 6_000, offsetAmount: 6_000, payableAmount: 6_000, idempotent: false });
    expect(settled.body.settlement.accountingEntryId).toEqual(expect.any(String));
    const settlementReplay = await request(app.getHttpServer())
      .post(`/finance/tax-periods/${period}/settle`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `period-tax-settlement-${run}` })
      .expect(201);
    expect(settlementReplay.body).toMatchObject({ idempotent: true, settlement: { id: settled.body.settlement.id } });
    await request(app.getHttpServer())
      .post(`/finance/journal/${outputEntry.id}/reverse`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `period-late-reversal-${run}`, reason: 'Позднее сторно после налоговой сверки', occurredAt: now.toISOString() })
      .expect(409);
    const settlementEntry = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { id: settled.body.settlement.accountingEntryId },
      include: { lines: { orderBy: { accountCode: 'asc' } } },
    });
    expect(settlementEntry.lines).toMatchObject([
      { accountCode: '1210', debit: 0, credit: 6_000 },
      { accountCode: '2200', debit: 6_000, credit: 0 },
    ]);

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

  });

  it('records cash incassation as an idempotent 1010/1000 journal movement', async () => {
    const now = new Date();
    const shift = await prisma.cashShift.create({
      data: { staffId: ownerId, point: 'BISHKEK-1', openCash: 5_000, closeCash: 45_000, closedAt: now },
    });
    const payload = { amount: 30_000, reference: 'BANK-BAG-001' };
    const created = await request(app.getHttpServer())
      .post(`/finance/cash-incassations/${shift.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `incassation-${run}-1`)
      .send(payload)
      .expect(201);
    expect(created.body).toMatchObject({ shiftId: shift.id, amount: 30_000, point: 'BISHKEK-1', status: 'deposited', idempotent: false });
    expect(created.body.accountingEntryId).toEqual(expect.any(String));

    const replay = await request(app.getHttpServer())
      .post(`/finance/cash-incassations/${shift.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `incassation-${run}-1`)
      .send(payload)
      .expect(201);
    expect(replay.body).toMatchObject({ id: created.body.id, idempotent: true });

    await request(app.getHttpServer())
      .post(`/finance/cash-incassations/${shift.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `incassation-${run}-2`)
      .send({ amount: 20_000 })
      .expect(409);

    const entry = await prisma.accountingJournalEntry.findUniqueOrThrow({ where: { id: created.body.accountingEntryId }, include: { lines: { orderBy: { accountCode: 'asc' } } } });
    expect(entry).toMatchObject({ sourceType: 'cash.incassation', sourceRef: created.body.id, point: 'BISHKEK-1' });
    expect(entry.lines).toMatchObject([
      { accountCode: '1000', debit: 0, credit: 30_000 },
      { accountCode: '1010', debit: 30_000, credit: 0 },
    ]);
    const rows = await request(app.getHttpServer()).get('/finance/cash-incassations?point=BISHKEK-1').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(rows.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.id, accountingEntryId: entry.id })]));

    const statement = await request(app.getHttpServer())
      .post('/finance/bank-statements')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        idempotencyKey: `incassation-statement-${run}`,
        statementNumber: `INCASSATION-${run}`,
        accountCode: '1010',
        periodStart: new Date(now.getTime() - 86_400_000).toISOString(),
        periodEnd: new Date(now.getTime() + 86_400_000).toISOString(),
        openingBalance: 0,
        closingBalance: 30_000,
        lines: [{ externalId: `incassation-bank-line-${run}`, occurredAt: now.toISOString(), amount: 30_000 }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/finance/bank-statements/lines/${statement.body.lines[0].id}/reconcile`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `incassation-reconcile-${run}`, journalEntryId: entry.id })
      .expect(201);
    const reconciled = await prisma.cashIncassation.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(reconciled.status).toBe('reconciled');
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

  it('creates a balanced opening balance once and protects period and idempotency invariants', async () => {
    const payload = {
      idempotencyKey: `opening-${run}`,
      period: '2025-01',
      documentNumber: `OPENING-${run}`,
      description: 'Начальные остатки на дату перехода',
      lines: [
        { accountCode: '1000', debit: 120_000, credit: 0, memo: 'Касса' },
        { accountCode: '3000', debit: 0, credit: 120_000, memo: 'Капитал' },
      ],
    };

    await request(app.getHttpServer()).get('/finance/opening-balances').expect(401);
    await request(app.getHttpServer()).post('/finance/opening-balances').set('Authorization', `Bearer ${sellerToken}`).send(payload).expect(403);

    const created = await request(app.getHttpServer())
      .post('/finance/opening-balances')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(payload)
      .expect(201);
    expect(created.body).toMatchObject({ period: '2025-01', documentNumber: payload.documentNumber, idempotent: false });
    expect(created.body.lines).toEqual(expect.arrayContaining(payload.lines.map((line) => expect.objectContaining(line))));
    expect(created.body.accountingEntry.lines).toEqual(expect.arrayContaining(payload.lines.map(({ accountCode, debit, credit }) => expect.objectContaining({ accountCode, debit, credit }))));

    const replay = await request(app.getHttpServer())
      .post('/finance/opening-balances')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(payload)
      .expect(201);
    expect(replay.body).toMatchObject({ id: created.body.id, idempotent: true });

    await request(app.getHttpServer())
      .post('/finance/opening-balances')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...payload, lines: [{ ...payload.lines[0], debit: 130_000 }, { ...payload.lines[1], credit: 130_000 }] })
      .expect(409);
    await request(app.getHttpServer())
      .post('/finance/opening-balances')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...payload, idempotencyKey: `opening-${run}-period-conflict`, documentNumber: `OPENING-${run}-2` })
      .expect(409);
    await request(app.getHttpServer())
      .post('/finance/opening-balances')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...payload, idempotencyKey: `opening-${run}-unbalanced`, period: '2025-02', documentNumber: `OPENING-${run}-3`, lines: [{ accountCode: '1000', debit: 100, credit: 0 }, { accountCode: '3000', debit: 0, credit: 90 }] })
      .expect(422);

    const rows = await request(app.getHttpServer()).get('/finance/opening-balances').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(rows.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.id, period: '2025-01' })]));
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: 'finance.opening-balance', sourceRef: created.body.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'finance.opening_balance.created', refs: { has: created.body.id } } })).toBe(1);
  });

  it('registers fixed assets and posts sequential, replay-safe depreciation', async () => {
    const payload = {
      idempotencyKey: `fixed-asset-${run}`,
      assetNumber: `FA-${run}`,
      name: 'POS терминал',
      category: 'equipment',
      serialNumber: `POS-SN-${run}`,
      acquisitionCost: 100_000,
      usefulLifeMonths: 3,
      acquiredAt: '2026-01-15T00:00:00.000Z',
      inServiceAt: '2026-01-15T00:00:00.000Z',
      fundingAccountCode: '1010',
      externalRef: `FA-INVOICE-${run}`,
    };

    await request(app.getHttpServer()).get('/finance/fixed-assets').expect(401);
    await request(app.getHttpServer()).post('/finance/fixed-assets').set('Authorization', `Bearer ${sellerToken}`).send(payload).expect(403);

    const created = await request(app.getHttpServer())
      .post('/finance/fixed-assets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(payload)
      .expect(201);
    expect(created.body).toMatchObject({ assetNumber: payload.assetNumber, acquisitionCost: 100_000, accumulatedDepreciation: 0, status: 'active', idempotent: false });
    expect(created.body.acquisitionAccountingEntry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1400', debit: 100_000, credit: 0 }),
      expect.objectContaining({ accountCode: '1010', debit: 0, credit: 100_000 }),
    ]));

    const replay = await request(app.getHttpServer())
      .post('/finance/fixed-assets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(payload)
      .expect(201);
    expect(replay.body).toMatchObject({ id: created.body.id, idempotent: true });
    await request(app.getHttpServer())
      .post('/finance/fixed-assets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...payload, acquisitionCost: 110_000 })
      .expect(409);
    await request(app.getHttpServer())
      .post('/finance/fixed-assets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...payload, idempotencyKey: `fixed-asset-${run}-number-conflict` })
      .expect(409);

    const depreciation = (period: string) => request(app.getHttpServer())
      .post(`/finance/fixed-assets/${created.body.id}/depreciation`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `fixed-asset-depreciation-${run}-${period}`, period });

    const january = await depreciation('2026-01').expect(201);
    expect(january.body).toMatchObject({ period: '2026-01', amount: 33_333, openingAccumulated: 0, closingAccumulated: 33_333, idempotent: false });
    expect(january.body.accountingEntry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '6700', debit: 33_333, credit: 0 }),
      expect.objectContaining({ accountCode: '1410', debit: 0, credit: 33_333 }),
    ]));
    const januaryReplay = await depreciation('2026-01').expect(201);
    expect(januaryReplay.body).toMatchObject({ id: january.body.id, idempotent: true });
    await depreciation('2026-03').expect(409);

    const february = await depreciation('2026-02').expect(201);
    expect(february.body).toMatchObject({ amount: 33_333, openingAccumulated: 33_333, closingAccumulated: 66_666 });
    const march = await depreciation('2026-03').expect(201);
    expect(march.body).toMatchObject({ amount: 33_334, openingAccumulated: 66_666, closingAccumulated: 100_000, fixedAsset: { status: 'fully_depreciated', accumulatedDepreciation: 100_000 } });
    await depreciation('2026-04').expect(409);

    const rows = await request(app.getHttpServer()).get('/finance/fixed-assets').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(rows.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.id, status: 'fully_depreciated', accumulatedDepreciation: 100_000, depreciationEntries: expect.any(Array) })]));
    expect(await prisma.fixedAssetDepreciation.count({ where: { fixedAssetId: created.body.id } })).toBe(3);
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: { in: ['finance.fixed_asset.acquisition', 'finance.fixed_asset.depreciation'] } } })).toBe(4);
    expect(await prisma.auditEvent.count({ where: { type: 'finance.fixed_asset_acquired', refs: { has: created.body.id } } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'finance.fixed_asset_depreciated', refs: { has: created.body.id } } })).toBe(3);
  });

  it('imports bank statements with balance control and exposes unmatched lines', async () => {
    const now = new Date();
    const payload = {
      idempotencyKey: `bank-${run}`,
      statementNumber: `BANK-${run}`,
      accountCode: '1010',
      periodStart: new Date(now.getTime() - 86_400_000).toISOString(),
      periodEnd: new Date(now.getTime() + 86_400_000).toISOString(),
      openingBalance: 10_000,
      closingBalance: 12_000,
      lines: [{ externalId: `bank-line-${run}`, occurredAt: now.toISOString(), amount: 2_000, reference: 'TEST' }],
    };
    await request(app.getHttpServer()).post('/finance/bank-statements').expect(401);
    const imported = await request(app.getHttpServer()).post('/finance/bank-statements').set('Authorization', `Bearer ${ownerToken}`).send(payload).expect(201);
    expect(imported.body.status).toBe('imported');
    expect(imported.body.lines).toHaveLength(1);
    const journal = await prisma.accountingJournalEntry.create({
      data: {
        idempotencyKey: `bank-journal-${run}`,
        sourceType: 'test.bank.receipt',
        sourceRef: `bank-${run}`,
        description: 'Тестовое поступление на расчётный счёт',
        occurredAt: now,
        createdBy: ownerId,
        lines: { create: [{ accountCode: '1010', debit: 2_000, credit: 0 }, { accountCode: '4000', debit: 0, credit: 2_000 }] },
      },
    });
    const matched = await request(app.getHttpServer())
      .post(`/finance/bank-statements/lines/${imported.body.lines[0].id}/reconcile`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `bank-reconcile-${run}`, journalEntryId: journal.id })
      .expect(201);
    expect(matched.body.status).toBe('matched');
    expect(matched.body.statementStatus).toBe('reconciled');
    const replay = await request(app.getHttpServer()).post('/finance/bank-statements').set('Authorization', `Bearer ${ownerToken}`).send(payload).expect(201);
    expect(replay.body.idempotent).toBe(true);
    await request(app.getHttpServer()).post('/finance/bank-statements').set('Authorization', `Bearer ${ownerToken}`).send({ ...payload, idempotencyKey: `bank-${run}-bad`, closingBalance: 13_000 }).expect(409);
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
    const firstId = await createApproved('shared-a');
    const secondId = await createApproved('shared-b');
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
