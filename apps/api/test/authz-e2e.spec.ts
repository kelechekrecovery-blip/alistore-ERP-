import { Controller, INestApplication, Post, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { AuthzModule } from '../src/authz/authz.module';
import { PermissionGuard } from '../src/authz/permission.guard';
import { RequirePermission } from '../src/authz/require-permission.decorator';
import { TotpService } from '../src/auth/totp.service';

/** A dangerous endpoint guarded exactly how the real ones should be. */
@Controller('demo-danger')
class DemoController {
  @Post('refund')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('refund', 'approve')
  refund() {
    return { ok: true };
  }
}

/**
 * End-to-end proof of the P0-authz chain: staff login → role in the JWT →
 * JwtStrategy surfaces it → PermissionGuard (casbin) authorizes. An admin may hit
 * the guarded refund endpoint; a plain seller is refused (403).
 */
describe('Authz end-to-end (staff role → casbin guard)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  const RUN = Math.floor(Math.random() * 1_000_000);
  const SECRET = 'e2e-authz-secret';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: SECRET }),
        AuthzModule,
      ],
      controllers: [DemoController],
      providers: [
        StaffAuthService,
        TotpService,
        JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: (k: string) => (k === 'JWT_SECRET' ? SECRET : undefined) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    staffAuth = moduleRef.get(StaffAuthService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function token(role: 'admin' | 'seller'): Promise<string> {
    const username = `${role}-${RUN}`;
    await staffAuth.createStaff(username, 'pass', role);
    const { accessToken } = await staffAuth.login(username, 'pass');
    return accessToken;
  }

  it('allows an admin to hit the guarded refund endpoint', async () => {
    const admin = await token('admin');
    await request(app.getHttpServer())
      .post('/demo-danger/refund')
      .set('Authorization', `Bearer ${admin}`)
      .expect(201);
  });

  it('refuses a seller (403) — not just body-trusted role', async () => {
    const seller = await token('seller');
    await request(app.getHttpServer())
      .post('/demo-danger/refund')
      .set('Authorization', `Bearer ${seller}`)
      .expect(403);
  });

  it('refuses an unauthenticated request (401)', async () => {
    await request(app.getHttpServer()).post('/demo-danger/refund').expect(401);
  });
});
