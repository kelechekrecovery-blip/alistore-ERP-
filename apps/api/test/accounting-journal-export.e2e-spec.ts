import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { FinanceModule } from '../src/finance/finance.module';
import { postAccountingEntryOnTx } from '../src/finance/accounting-journal';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Finance journal CSV export', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let sellerToken: string;
  const run = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, FinanceModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const staffAuth = moduleRef.get(StaffAuthService);
    await staffAuth.createStaff(`owner-journal-export-${run}`, 'pass', 'owner');
    ownerToken = (await staffAuth.login(`owner-journal-export-${run}`, 'pass')).accessToken;
    await staffAuth.createStaff(`seller-journal-export-${run}`, 'pass', 'seller');
    sellerToken = (await staffAuth.login(`seller-journal-export-${run}`, 'pass')).accessToken;
  });

  async function clean() {
    const entries = await prisma.accountingJournalEntry.findMany({ where: { sourceType: 'export.test' }, select: { id: true } });
    if (entries.length === 0) return;
    const entryIds = entries.map((entry) => entry.id);
    await prisma.$transaction(async (tx) => {
      await tx.accountingJournalLine.deleteMany({ where: { entryId: { in: entryIds } } });
      await tx.accountingJournalEntry.deleteMany({ where: { id: { in: entryIds } } });
    });
  }

  beforeEach(clean);
  afterAll(async () => {
    await clean();
    await app.close();
  });

  it('exports server journal lines with provenance and formula-safe CSV escaping', async () => {
    const occurredAt = new Date('2026-07-17T08:00:00.000Z');
    await prisma.$transaction((tx) => postAccountingEntryOnTx(tx, {
      idempotencyKey: `export-${run}`,
      sourceType: 'export.test',
      sourceRef: `document-${run}`,
      description: 'Первичный документ, тест',
      occurredAt,
      createdBy: 'export-test',
      lines: [
        { accountCode: '1100', debit: 123_000, memo: '=не формула' },
        { accountCode: '4000', credit: 123_000, memo: 'Продажа, KGS' },
      ],
    }));

    const from = new Date('2026-07-17T00:00:00.000Z').toISOString();
    const to = new Date('2026-07-18T00:00:00.000Z').toISOString();
    const response = await request(app.getHttpServer())
      .get(`/finance/journal/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&sourceType=export.test`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('alistore-journal.csv');
    expect(response.text).toContain('"entry_id","source_type","source_ref"');
    expect(response.text).toContain(`"document-${run}"`);
    expect(response.text).toContain('"\'=не формула"');
    expect(response.text).toContain('"Продажа, KGS"');
    expect(response.text).toContain('"1100"');
    expect(response.text).toContain('"123000"');
  });

  it('keeps journal export behind finance read RBAC', async () => {
    await request(app.getHttpServer())
      .get('/finance/journal/export?from=2026-07-17T00:00:00.000Z&to=2026-07-18T00:00:00.000Z')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);
  });
});
