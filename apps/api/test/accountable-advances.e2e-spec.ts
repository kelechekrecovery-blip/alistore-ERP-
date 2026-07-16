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

describe('Accountable advances (integration + accounting)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let ownerToken: string;
  let sellerToken: string;
  let beneficiaryId: string;
  const run = Math.floor(Math.random() * 1_000_000);

  const sourceTypes = [
    'finance.accountable_advance.issue',
    'finance.accountable_advance.settlement',
    'finance.accountable_advance.return',
    'finance.accountable_advance.reimbursement',
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, FinanceModule, ReportsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);

    const ownerUsername = `owner-accountable-${run}`;
    const sellerUsername = `seller-accountable-${run}`;
    const beneficiary = await staffAuth.createStaff(`beneficiary-accountable-${run}`, 'pass', 'seller');
    beneficiaryId = beneficiary.id;
    await staffAuth.createStaff(ownerUsername, 'pass', 'owner');
    await staffAuth.createStaff(sellerUsername, 'pass', 'seller');
    ownerToken = (await staffAuth.login(ownerUsername, 'pass')).accessToken;
    sellerToken = (await staffAuth.login(sellerUsername, 'pass')).accessToken;
  });

  async function clean() {
    const entries = await prisma.accountingJournalEntry.findMany({ where: { sourceType: { in: sourceTypes } }, select: { id: true } });
    const entryIds = entries.map((entry) => entry.id);
    await prisma.$transaction([
      prisma.accountableAdvanceReimbursement.deleteMany(),
      prisma.accountableAdvanceReturn.deleteMany(),
      prisma.accountableAdvanceSettlement.deleteMany(),
      prisma.accountableAdvance.deleteMany(),
      ...(entryIds.length ? [
        prisma.accountingJournalLine.deleteMany({ where: { entryId: { in: entryIds } } }),
        prisma.accountingJournalEntry.deleteMany({ where: { id: { in: entryIds } } }),
      ] : []),
      prisma.auditEvent.deleteMany({ where: { type: { in: ['finance.accountable_advance_issued', 'finance.accountable_advance_settled', 'finance.accountable_advance_returned', 'finance.accountable_advance_reimbursed'] } } }),
    ]);
  }

  beforeEach(clean);
  afterEach(clean);
  afterAll(async () => app.close());

  it('issues, settles and returns an advance exactly once', async () => {
    const payload = {
      idempotencyKey: `accountable-${run}-return`,
      staffId: beneficiaryId,
      amount: 100_000,
      purpose: 'Командировочные расходы',
      point: 'BISHKEK-1',
      dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      fundingAccountCode: '1010',
      paymentReference: `ADV-${run}-RETURN`,
    };

    await request(app.getHttpServer()).get('/finance/accountable-advances').expect(401);
    await request(app.getHttpServer()).post('/finance/accountable-advances').set('Authorization', `Bearer ${sellerToken}`).send(payload).expect(403);
    const created = await request(app.getHttpServer()).post('/finance/accountable-advances').set('Authorization', `Bearer ${ownerToken}`).send(payload).expect(201);
    expect(created.body).toMatchObject({ staffId: beneficiaryId, amount: 100_000, settledAmount: 0, returnedAmount: 0, reimbursedAmount: 0, balance: 100_000, status: 'open', idempotent: false });
    expect(created.body.accountingEntry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1250', debit: 100_000, credit: 0 }),
      expect.objectContaining({ accountCode: '1010', debit: 0, credit: 100_000 }),
    ]));

    const replay = await request(app.getHttpServer()).post('/finance/accountable-advances').set('Authorization', `Bearer ${ownerToken}`).send(payload).expect(201);
    expect(replay.body).toMatchObject({ id: created.body.id, idempotent: true, balance: 100_000 });
    await request(app.getHttpServer()).post('/finance/accountable-advances').set('Authorization', `Bearer ${ownerToken}`).send({ ...payload, amount: 100_001 }).expect(409);

    const settlementPayload = { idempotencyKey: `accountable-${run}-return-settlement`, amount: 60_000, expenseAccountCode: '6300', description: 'Билеты и логистика' };
    const settlement = await request(app.getHttpServer()).post(`/finance/accountable-advances/${created.body.id}/settle`).set('Authorization', `Bearer ${ownerToken}`).send(settlementPayload).expect(201);
    expect(settlement.body.advance).toMatchObject({ settledAmount: 60_000, balance: 40_000, status: 'partially_settled' });
    expect(settlement.body.settlement.accountingEntry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '6300', debit: 60_000, credit: 0 }),
      expect.objectContaining({ accountCode: '1250', debit: 0, credit: 60_000 }),
    ]));
    const settlementReplay = await request(app.getHttpServer()).post(`/finance/accountable-advances/${created.body.id}/settle`).set('Authorization', `Bearer ${ownerToken}`).send(settlementPayload).expect(201);
    expect(settlementReplay.body).toMatchObject({ idempotent: true, advance: { balance: 40_000 } });

    const returned = await request(app.getHttpServer()).post(`/finance/accountable-advances/${created.body.id}/return`).set('Authorization', `Bearer ${ownerToken}`).send({ idempotencyKey: `accountable-${run}-return-close`, amount: 40_000, fundingAccountCode: '1010', paymentReference: `RETURN-${run}` }).expect(201);
    expect(returned.body.advance).toMatchObject({ settledAmount: 60_000, returnedAmount: 40_000, balance: 0, status: 'settled' });
    await request(app.getHttpServer()).post(`/finance/accountable-advances/${created.body.id}/return`).set('Authorization', `Bearer ${ownerToken}`).send({ idempotencyKey: `accountable-${run}-return-too-much`, amount: 1, fundingAccountCode: '1010', paymentReference: `RETURN-${run}-2` }).expect(409);
    await request(app.getHttpServer()).post(`/finance/accountable-advances/${created.body.id}/settle`).set('Authorization', `Bearer ${ownerToken}`).send({ ...settlementPayload, idempotencyKey: `accountable-${run}-after-close` }).expect(409);
  });

  it('reconciles overspend through reimbursement and exposes authoritative balance', async () => {
    const created = await request(app.getHttpServer()).post('/finance/accountable-advances').set('Authorization', `Bearer ${ownerToken}`).send({
      idempotencyKey: `accountable-${run}-reimburse`, staffId: beneficiaryId, amount: 100_000, purpose: 'Закупка расходных материалов', fundingAccountCode: '1000', paymentReference: `ADV-${run}-REIMBURSE`,
    }).expect(201);
    const settlement = await request(app.getHttpServer()).post(`/finance/accountable-advances/${created.body.id}/settle`).set('Authorization', `Bearer ${ownerToken}`).send({ idempotencyKey: `accountable-${run}-reimburse-settlement`, amount: 120_000, expenseAccountCode: '6900', description: 'Расходные материалы' }).expect(201);
    expect(settlement.body.advance).toMatchObject({ settledAmount: 120_000, balance: -20_000, status: 'partially_settled' });
    const reimbursed = await request(app.getHttpServer()).post(`/finance/accountable-advances/${created.body.id}/reimburse`).set('Authorization', `Bearer ${ownerToken}`).send({ idempotencyKey: `accountable-${run}-reimburse-close`, amount: 20_000, fundingAccountCode: '1000', paymentReference: `REIMBURSE-${run}` }).expect(201);
    expect(reimbursed.body.advance).toMatchObject({ settledAmount: 120_000, reimbursedAmount: 20_000, balance: 0, status: 'settled' });
    const replay = await request(app.getHttpServer()).post(`/finance/accountable-advances/${created.body.id}/reimburse`).set('Authorization', `Bearer ${ownerToken}`).send({ idempotencyKey: `accountable-${run}-reimburse-close`, amount: 20_000, fundingAccountCode: '1000', paymentReference: `REIMBURSE-${run}` }).expect(201);
    expect(replay.body).toMatchObject({ idempotent: true, advance: { balance: 0 } });

    const rows = await request(app.getHttpServer()).get(`/finance/accountable-advances?staffId=${beneficiaryId}`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(rows.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.id, balance: 0, status: 'settled' })]));
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: { in: sourceTypes } } })).toBe(3);
    expect(await prisma.auditEvent.count({ where: { type: 'finance.accountable_advance_issued', refs: { has: created.body.id } } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'finance.accountable_advance_settled', refs: { has: created.body.id } } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'finance.accountable_advance_reimbursed', refs: { has: created.body.id } } })).toBe(1);
  });
});
