import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { MediaModule } from '../src/media/media.module';
import { PaymentsModule } from '../src/payments/payments.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

/**
 * Two permission holes closed together:
 *  - POST /media used to sit behind a bare JwtAuthGuard, so any authenticated
 *    customer could upload unbounded files;
 *  - GET /payments required `payments read`, which did not exist in the policy,
 *    so it answered 403 even for the owner.
 *
 * The upload cases deliberately send no file: authorization runs before the
 * handler, so a 422 `no_file` proves the guard let the caller through without
 * touching object storage, while 403 proves it did not.
 */
describe('Media upload / payments read RBAC', () => {
  let app: INestApplication;
  let staffAuth: StaffAuthService;
  const RUN = Math.floor(Math.random() * 1_000_000);
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        MediaModule,
        PaymentsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    staffAuth = moduleRef.get(StaffAuthService);

    for (const role of ['owner', 'marketer', 'seller', 'cashier'] as const) {
      const username = `${role}-media-${RUN}`;
      await staffAuth.createStaff(username, 'pass', role);
      tokens[role] = (await staffAuth.login(username, 'pass')).accessToken;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets roles that own product/storefront imagery reach the upload handler', async () => {
    for (const role of ['owner', 'marketer'] as const) {
      const res = await request(app.getHttpServer())
        .post('/media')
        .set('Authorization', `Bearer ${tokens[role]}`);
      expect(res.status).not.toBe(403);
      expect(res.status).toBe(422); // no_file — the guard passed, the handler rejected
    }
  });

  it('denies media upload to roles without the grant', async () => {
    for (const role of ['seller', 'cashier'] as const) {
      const res = await request(app.getHttpServer())
        .post('/media')
        .set('Authorization', `Bearer ${tokens[role]}`);
      expect(res.status).toBe(403);
    }
  });

  it('rejects an unauthenticated media upload', async () => {
    const res = await request(app.getHttpServer()).post('/media');
    expect(res.status).toBe(401);
  });

  it('allows the owner to list payments and denies a seller', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/payments')
      .set('Authorization', `Bearer ${tokens.owner}`);
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body)).toBe(true);

    const denied = await request(app.getHttpServer())
      .get('/payments')
      .set('Authorization', `Bearer ${tokens.seller}`);
    expect(denied.status).toBe(403);
  });
});
