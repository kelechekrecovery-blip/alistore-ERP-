import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { authenticator } from 'otplib';
import { AuditModule } from '../src/audit/audit.module';
import { ApprovalsModule } from '../src/approvals/approvals.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

/**
 * LEDGER-HARDEN-34: rejecting a dangerous action runs its rejection executor
 * (which can restore/void stock), so reject is gated by the same 2FA step-up as
 * approve. Before the fix `PATCH /approvals/:id/decide` with status=rejected went
 * through `decide` (no step-up); now it goes through `decideWithStepUp`.
 */
describe('Approvals: reject requires a 2FA step-up', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let totpSecret: string;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, ApprovalsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const staffAuth = moduleRef.get(StaffAuthService);

    const username = `reject-stepup-admin-${RUN}`;
    const staff = await staffAuth.createStaff(username, 'pass', 'admin');
    totpSecret = authenticator.generateSecret();
    await prisma.staffUser.update({ where: { id: staff.id }, data: { totpSecret, totpEnabled: true } });
    adminToken = (await staffAuth.login(username, 'pass')).accessToken;
  });

  afterAll(async () => {
    await prisma.approval.deleteMany({ where: { requester: { startsWith: `reject-stepup-${RUN}` } } });
    await app.close();
  });

  async function refundApproval() {
    return prisma.approval.create({
      data: {
        action: 'refund',
        requester: `reject-stepup-${RUN}-requester`,
        reason: 'test',
        status: 'requested',
        evidence: { payload: null, evidence: null },
      },
    });
  }

  it('denies a reject with no TOTP token and leaves the approval requested', async () => {
    const a = await refundApproval();
    const res = await request(app.getHttpServer())
      .patch(`/approvals/${a.id}/decide`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', reason: 'no second factor' })
      .expect(403);

    expect(res.body.code).toBe('staff_2fa_token_required');
    expect((await prisma.approval.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('requested');
  });

  it('allows a reject with a valid TOTP token', async () => {
    const a = await refundApproval();
    const res = await request(app.getHttpServer())
      .patch(`/approvals/${a.id}/decide`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', reason: 'second factor supplied', totpToken: authenticator.generate(totpSecret) })
      .expect(200);

    expect(res.body.status).toBe('rejected');
    expect((await prisma.approval.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('rejected');
  });
});
