import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ApprovalsModule } from '../src/approvals/approvals.module';
import { AuditModule } from '../src/audit/audit.module';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Approval decisions use staff JWT role, not body approverRole', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' }),
        PrismaModule,
        AuditModule,
        ApprovalsModule,
      ],
      providers: [JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function approval(action = 'refund') {
    return prisma.approval.create({
      data: {
        action,
        requester: `seller-${RUN}`,
        reason: 'test',
        evidence: { payload: null, evidence: null },
      },
    });
  }

  function staffToken(role: string) {
    return jwt.sign({ sub: `staff-${role}-${RUN}`, typ: 'staff', role });
  }

  it('refuses anonymous and body-spoofed seller decisions', async () => {
    const a = await approval('refund');
    const server = app.getHttpServer();

    await request(server)
      .patch(`/approvals/${a.id}/decide`)
      .send({ status: 'approved', approver: 'x', approverRole: 'owner' })
      .expect(401);

    await request(server)
      .patch(`/approvals/${a.id}/decide`)
      .set('Authorization', `Bearer ${staffToken('seller')}`)
      .send({ status: 'approved', approver: 'x', approverRole: 'owner' })
      .expect(403);

    expect((await prisma.approval.findUnique({ where: { id: a.id } }))?.status).toBe('requested');
  });

  it('allows an authorized admin JWT to decide a refund approval', async () => {
    const a = await approval('refund');

    const res = await request(app.getHttpServer())
      .patch(`/approvals/${a.id}/decide`)
      .set('Authorization', `Bearer ${staffToken('admin')}`)
      .send({ status: 'approved' })
      .expect(200);

    expect(res.body.status).toBe('approved');
    expect(res.body.approver).toBe(`staff-admin-${RUN}`);
  });
});
