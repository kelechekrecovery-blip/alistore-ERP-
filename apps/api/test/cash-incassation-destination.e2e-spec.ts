import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { FinanceModule } from '../src/finance/finance.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

/**
 * `CashIncassation.destinationCode` existed in the schema (default '1010') but
 * nothing read or wrote it — the account was hardcoded, so cash could only ever
 * be booked as a bank deposit. A small shop where the owner simply takes the
 * cash needs `3000 «Капитал владельца»` (equity, already in the chart) instead:
 * Дт 3000 / Кт 1000 is a distribution, not a transfer.
 */
describe('Cash incassation destination (bank vs owner draw)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let ownerId: string;
  const run = Math.floor(Math.random() * 1_000_000);
  const point = `INC-${run}`;
  const shiftIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, FinanceModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const auth = moduleRef.get(StaffAuthService);
    const staff = await auth.createStaff(`owner-inc-${run}`, 'pass', 'owner');
    ownerId = staff.id;
    ownerToken = (await auth.login(`owner-inc-${run}`, 'pass')).accessToken;
  });

  afterAll(async () => {
    const rows = await prisma.cashIncassation.findMany({ where: { point }, select: { id: true, accountingEntryId: true } });
    await prisma.cashIncassation.deleteMany({ where: { point } });
    const entryIds = rows.map((r) => r.accountingEntryId).filter((id): id is string => Boolean(id));
    // A deferred constraint trigger keeps every entry balanced, so lines and
    // entry must disappear in the same transaction — deleting lines alone
    // leaves a 0/0 entry and trips the check.
    await prisma.$transaction([
      prisma.accountingJournalLine.deleteMany({ where: { entryId: { in: entryIds } } }),
      prisma.accountingJournalEntry.deleteMany({ where: { id: { in: entryIds } } }),
    ]);
    await prisma.cashShift.deleteMany({ where: { id: { in: shiftIds } } });
    await prisma.staffUser.deleteMany({ where: { username: `owner-inc-${run}` } });
    await app.close();
  });

  async function closedShift(closeCash: number) {
    const shift = await prisma.cashShift.create({
      data: { staffId: ownerId, point, openCash: 0, closeCash, closedAt: new Date() },
    });
    shiftIds.push(shift.id);
    return shift;
  }

  async function linesOf(entryId: string) {
    const entry = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { id: entryId },
      include: { lines: { orderBy: { accountCode: 'asc' } } },
    });
    return entry.lines.map((l) => ({ accountCode: l.accountCode, debit: l.debit, credit: l.credit }));
  }

  it('books an owner draw against equity 3000, balanced', async () => {
    const shift = await closedShift(50_000);
    const res = await request(app.getHttpServer())
      .post(`/finance/cash-incassations/${shift.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `inc-owner-${run}`)
      .send({ amount: 40_000, destinationCode: '3000', reference: 'выемка владельцем' })
      .expect(201);

    expect(res.body).toMatchObject({ amount: 40_000, destinationCode: '3000', point });
    const lines = await linesOf(res.body.accountingEntryId);
    expect(lines).toEqual([
      { accountCode: '1000', debit: 0, credit: 40_000 },
      { accountCode: '3000', debit: 40_000, credit: 0 },
    ]);
    const debit = lines.reduce((s, l) => s + l.debit, 0);
    const credit = lines.reduce((s, l) => s + l.credit, 0);
    expect(debit).toBe(credit);
  });

  it('still defaults to the bank account when no destination is given', async () => {
    const shift = await closedShift(20_000);
    const res = await request(app.getHttpServer())
      .post(`/finance/cash-incassations/${shift.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `inc-bank-${run}`)
      .send({ amount: 15_000 })
      .expect(201);

    expect(res.body.destinationCode).toBe('1010');
    expect(await linesOf(res.body.accountingEntryId)).toEqual([
      { accountCode: '1000', debit: 0, credit: 15_000 },
      { accountCode: '1010', debit: 15_000, credit: 0 },
    ]);
  });

  it('replays idempotently and refuses a changed destination under the same key', async () => {
    const shift = await closedShift(10_000);
    const body = { amount: 5_000, destinationCode: '3000' };
    const first = await request(app.getHttpServer())
      .post(`/finance/cash-incassations/${shift.id}`)
      .set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `inc-replay-${run}`)
      .send(body).expect(201);
    const replay = await request(app.getHttpServer())
      .post(`/finance/cash-incassations/${shift.id}`)
      .set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `inc-replay-${run}`)
      .send(body).expect(201);
    expect(replay.body).toMatchObject({ id: first.body.id, idempotent: true });

    await request(app.getHttpServer())
      .post(`/finance/cash-incassations/${shift.id}`)
      .set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `inc-replay-${run}`)
      .send({ amount: 5_000, destinationCode: '1010' }).expect(409);
  });

  it('lists only closed shifts that still hold uncollected cash', async () => {
    const shift = await closedShift(9_000);
    const before = await request(app.getHttpServer())
      .get(`/finance/collectable-shifts?point=${point}`)
      .set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(before.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: shift.id, available: 9_000, deposited: 0 }),
    ]));

    // Collect it all — the shift must drop out of the list.
    await request(app.getHttpServer())
      .post(`/finance/cash-incassations/${shift.id}`)
      .set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `inc-drain-${run}`)
      .send({ amount: 9_000, destinationCode: '3000' }).expect(201);

    const after = await request(app.getHttpServer())
      .get(`/finance/collectable-shifts?point=${point}`)
      .set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect((after.body as Array<{ id: string }>).some((row) => row.id === shift.id)).toBe(false);
  });

  it('rejects an account that is not a permitted destination', async () => {
    const shift = await closedShift(10_000);
    await request(app.getHttpServer())
      .post(`/finance/cash-incassations/${shift.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `inc-bad-${run}`)
      .send({ amount: 1_000, destinationCode: '1020' })
      .expect(400);
  });
});
