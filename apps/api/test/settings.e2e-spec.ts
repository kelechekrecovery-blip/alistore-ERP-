import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { AuditModule } from '../src/audit/audit.module';
import { AuthzModule } from '../src/authz/authz.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { SettingsModule } from '../src/settings/settings.module';
import { SettingsService } from '../src/settings/settings.service';

/**
 * Business parameters used to be `as const` literals, so changing an employee's
 * pay or a discount ceiling meant a deploy. These cover the two properties that
 * make the table safe to rely on: an unset parameter behaves exactly like the
 * old constant, and every change lands in the ledger with its previous value.
 */
describe('Settings (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let settings: SettingsService;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule, AuditModule, AuthzModule, StaffAuthModule, SettingsModule,
      ],
    })
      .overrideProvider(PrismaService).useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    settings = app.get(SettingsService);

    const staffAuth = app.get(StaffAuthService);
    for (const role of ['owner', 'admin'] as const) {
      const username = `settings-${role}-${Math.floor(Math.random() * 1_000_000)}`;
      await staffAuth.createStaff(username, 'pass', role);
      tokens[role] = (await staffAuth.login(username, 'pass')).accessToken;
    }
  });

  afterAll(async () => {
    await prisma.setting.deleteMany();
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.setting.deleteMany();
  });

  it('an unset parameter reports the constant that was in force before', async () => {
    // hr.service.ts PAYROLL_CONFIG.baseAmount was 15_000.
    expect(await settings.value('payroll.base_amount_som')).toBe(15_000);

    const res = await request(app.getHttpServer())
      .get('/settings')
      .set('Authorization', `Bearer ${tokens.owner}`)
      .expect(200);
    const base = res.body.find((s: { key: string }) => s.key === 'payroll.base_amount_som');
    expect(base).toMatchObject({ value: 15_000, overridden: false, updatedBy: null });
  });

  it('records the previous value in the ledger when the owner changes a parameter', async () => {
    await request(app.getHttpServer())
      .patch('/settings/payroll.base_amount_som')
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ value: '18000' })
      .expect(200);

    expect(await settings.value('payroll.base_amount_som')).toBe(18_000);

    const event = await prisma.auditEvent.findFirst({
      where: { type: 'settings.changed', refs: { has: 'payroll.base_amount_som' } },
      orderBy: { ts: 'desc' },
    });
    expect(event).toBeTruthy();
    expect(event!.payload).toMatchObject({ from: 15_000, to: 18_000, wasDefault: true });
  });

  it('refuses values outside the declared range and unknown keys', async () => {
    await request(app.getHttpServer())
      .patch('/settings/tradein.buyback_of_resale_pct')
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ value: '250' })
      .expect(422);

    await request(app.getHttpServer())
      .patch('/settings/nope.not_a_setting')
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ value: '1' })
      .expect(422);
  });

  it('falls back to the constant instead of throwing when a stored value is corrupt', async () => {
    await prisma.setting.create({
      data: { key: 'loyalty.earn_rate_bps', value: 'не число', updatedBy: 'test' },
    });
    // A broken row must never take a sale down.
    expect(await settings.value('loyalty.earn_rate_bps')).toBe(100);
  });

  it('only the owner may write; admin can read but not change', async () => {
    await request(app.getHttpServer())
      .get('/settings')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch('/settings/payroll.base_amount_som')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ value: '99000' })
      .expect(403);

    await request(app.getHttpServer())
      .patch('/settings/payroll.base_amount_som')
      .send({ value: '99000' })
      .expect(401);
  });
});
