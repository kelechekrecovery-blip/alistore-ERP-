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
 * `PATCH /approvals/:id/decide` has no `@RequirePermission` — per-action authz
 * rests entirely on the service-level `canApprove` check in
 * `ApprovalsService.decideOnTx` (approvals.service.ts:163), against the Role
 * Permission Matrix in `rbac/permissions.ts` (refund → admin/owner, write_off
 * → owner). This is a characterization/regression test: it locks that
 * invariant in place so a future refactor of `decideOnTx` can't silently drop
 * it without a controller-level `@RequirePermission` to catch the gap.
 *
 * The staff session has a valid, enabled 2FA code so the only gate exercised
 * is `canApprove` — not the separate step-up requirement already covered by
 * approvals-jwt-guard.e2e-spec.ts.
 */
describe('Approvals RBAC characterization: senior_seller cannot decide refund or write_off', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seniorSellerToken: string;
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

    const username = `senior-seller-decide-rbac-${RUN}`;
    const staff = await staffAuth.createStaff(username, 'pass', 'senior_seller');
    totpSecret = authenticator.generateSecret();
    await prisma.staffUser.update({ where: { id: staff.id }, data: { totpSecret, totpEnabled: true } });
    seniorSellerToken = (await staffAuth.login(username, 'pass')).accessToken;
  });

  afterAll(async () => {
    await prisma.approval.deleteMany({ where: { requester: { startsWith: `decide-rbac-${RUN}` } } });
    await app.close();
  });

  async function approval(action: 'refund' | 'write_off') {
    return prisma.approval.create({
      data: {
        action,
        requester: `decide-rbac-${RUN}-other-requester`,
        reason: 'test',
        status: 'requested',
        evidence: { payload: null, evidence: null },
      },
    });
  }

  it('denies senior_seller approving a refund approval (403, canApprove gate)', async () => {
    const a = await approval('refund');
    const res = await request(app.getHttpServer())
      .patch(`/approvals/${a.id}/decide`)
      .set('Authorization', `Bearer ${seniorSellerToken}`)
      .send({ status: 'approved', totpToken: authenticator.generate(totpSecret) })
      .expect(403);

    expect(res.body.code).toBe('approver_not_authorized');
    expect((await prisma.approval.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('requested');
  });

  it('denies senior_seller approving a write_off approval (403, canApprove gate)', async () => {
    const a = await approval('write_off');
    const res = await request(app.getHttpServer())
      .patch(`/approvals/${a.id}/decide`)
      .set('Authorization', `Bearer ${seniorSellerToken}`)
      .send({ status: 'approved', totpToken: authenticator.generate(totpSecret) })
      .expect(403);

    expect(res.body.code).toBe('approver_not_authorized');
    expect((await prisma.approval.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('requested');
  });
});
