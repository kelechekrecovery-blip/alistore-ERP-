import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { ApprovalsModule } from '../src/approvals/approvals.module';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { FinanceModule } from '../src/finance/finance.module';
import { FinanceService } from '../src/finance/finance.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Finance manual adjustment approval', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let finance: FinanceService;
  let approvals: ApprovalsService;
  let ownerToken: string;
  let sellerToken: string;
  const run = Math.floor(Math.random() * 1_000_000);
  const documentNumber = `МА-${run}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, ApprovalsModule, FinanceModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    finance = moduleRef.get(FinanceService);
    approvals = moduleRef.get(ApprovalsService);
    const staffAuth = moduleRef.get(StaffAuthService);
    await staffAuth.createStaff(`owner-manual-adjustment-${run}`, 'pass', 'owner');
    ownerToken = (await staffAuth.login(`owner-manual-adjustment-${run}`, 'pass')).accessToken;
    await staffAuth.createStaff(`seller-manual-adjustment-${run}`, 'pass', 'seller');
    sellerToken = (await staffAuth.login(`seller-manual-adjustment-${run}`, 'pass')).accessToken;
  });

  afterAll(async () => {
    const entry = await prisma.accountingJournalEntry.findUnique({ where: { sourceType_sourceRef: { sourceType: 'finance.manual_adjustment', sourceRef: documentNumber } }, select: { id: true } });
    await prisma.$transaction(async (tx) => {
      if (entry) {
        await tx.accountingJournalLine.deleteMany({ where: { entryId: entry.id } });
        await tx.accountingJournalEntry.delete({ where: { id: entry.id } });
      }
      await tx.approval.deleteMany({ where: { sourceRef: documentNumber } });
    });
    await app.close();
  });

  const payload = {
    idempotencyKey: `manual-adjustment-${run}`,
    documentNumber,
    description: 'Корректировка банковской комиссии',
    point: 'BISHKEK-1',
    occurredAt: '2026-07-17T09:00:00.000Z',
    lines: [
      { accountCode: '6990', debit: 1250, memo: 'Комиссия по выписке' },
      { accountCode: '1010', credit: 1250, memo: 'Расчётный счёт' },
    ],
  };

  it('parks an immutable balanced snapshot, replays safely and posts only after a separate approval', async () => {
    const created = await request(app.getHttpServer())
      .post('/finance/manual-adjustments')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(payload)
      .expect(201);
    expect(created.body).toMatchObject({ status: 'requested', idempotent: false, snapshot: { documentNumber, amount: 1250 } });
    expect(await prisma.accountingJournalEntry.findUnique({ where: { sourceType_sourceRef: { sourceType: 'finance.manual_adjustment', sourceRef: documentNumber } } })).toBeNull();

    const replay = await request(app.getHttpServer())
      .post('/finance/manual-adjustments')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(payload);
    expect(replay.status).toBe(201);
    expect(replay.body).toMatchObject({ approvalId: created.body.approvalId, status: 'requested', idempotent: true });

    const approval = await prisma.approval.findUniqueOrThrow({ where: { id: created.body.approvalId } });
    await expect(approvals.decide(created.body.approvalId, { status: 'approved', approver: approval.requester, approverRole: 'owner' })).rejects.toMatchObject({ code: 'four_eye_approval_required' });

    const approved = await approvals.decide(created.body.approvalId, { status: 'approved', approver: `different-owner-${run}`, approverRole: 'owner' });
    expect(approved?.status).toBe('approved');
    const entry = await prisma.accountingJournalEntry.findUnique({ where: { sourceType_sourceRef: { sourceType: 'finance.manual_adjustment', sourceRef: documentNumber } }, include: { lines: true } });
    expect(entry).toMatchObject({ documentAmount: 1250, point: 'BISHKEK-1', createdBy: `different-owner-${run}` });
    expect(entry?.lines.reduce((sum, line) => sum + line.debit, 0)).toBe(1250);
    expect(entry?.lines.reduce((sum, line) => sum + line.credit, 0)).toBe(1250);
    expect(await prisma.auditEvent.count({ where: { type: 'finance.manual_adjustment_posted', refs: { has: entry!.id } } })).toBe(1);

    const listed = await finance.listManualAdjustments('approved');
    expect(listed.find((item) => item.sourceRef === documentNumber)?.accountingEntry?.id).toBe(entry?.id);
  });

  it('keeps the request behind finance RBAC', async () => {
    await request(app.getHttpServer())
      .post('/finance/manual-adjustments')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ ...payload, idempotencyKey: `seller-manual-adjustment-${run}`, documentNumber: `${documentNumber}-seller` })
      .expect(403);
  });
});
