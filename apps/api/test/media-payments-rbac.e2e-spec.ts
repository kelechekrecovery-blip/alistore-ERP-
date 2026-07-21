import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { HealthModule } from '../src/health/health.module';
import { MediaModule } from '../src/media/media.module';
import { PaymentsModule } from '../src/payments/payments.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

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
  let prisma: PrismaService;
  const RUN = Math.floor(Math.random() * 1_000_000);
  const tokens: Record<string, string> = {};
  const staffIds: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        MediaModule,
        PaymentsModule,
        HealthModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    staffAuth = moduleRef.get(StaffAuthService);
    prisma = moduleRef.get(PrismaService);

    for (const role of ['owner', 'marketer', 'seller', 'cashier'] as const) {
      const username = `${role}-media-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      staffIds[role] = staff.id;
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

  it('keeps liveness public but closes the integrations readiness report', async () => {
    // Load balancers must still reach liveness without a token.
    await request(app.getHttpServer()).get('/health/live').expect(200);

    // The report enumerates every required env name and which ones are unset —
    // a checklist of what is not yet hardened, so it must not be anonymous.
    await request(app.getHttpServer()).get('/health/integrations').expect(401);

    const denied = await request(app.getHttpServer())
      .get('/health/integrations')
      .set('Authorization', `Bearer ${tokens.cashier}`);
    expect(denied.status).toBe(403);

    const allowed = await request(app.getHttpServer())
      .get('/health/integrations')
      .set('Authorization', `Bearer ${tokens.owner}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body).toHaveProperty('checks');
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

  it('never exposes payments from the caller’s own open drawer', async () => {
    const ownShift = await prisma.cashShift.create({
      data: { staffId: staffIds.owner, point: 'BISHKEK-1', openCash: 5_000 },
    });
    const foreignShift = await prisma.cashShift.create({
      data: { staffId: staffIds.cashier, point: 'BISHKEK-1', openCash: 2_000 },
    });
    const ownPayment = await prisma.payment.create({
      data: { shiftId: ownShift.id, amount: 11_000, method: 'cash', status: 'received' },
    });
    const foreignPayment = await prisma.payment.create({
      data: { shiftId: foreignShift.id, amount: 7_000, method: 'cash', status: 'received' },
    });
    const shiftlessPayment = await prisma.payment.create({
      data: { amount: 3_000, method: 'card', status: 'received' },
    });

    const broad = await request(app.getHttpServer())
      .get('/payments')
      .set('Authorization', `Bearer ${tokens.owner}`)
      .expect(200);
    expect(broad.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: foreignPayment.id })]));
    expect(broad.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: shiftlessPayment.id })]));
    expect(broad.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: ownPayment.id })]));

    const direct = await request(app.getHttpServer())
      .get(`/payments?shiftId=${ownShift.id}`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .expect(200);
    expect(direct.body).toEqual([]);

    await prisma.payment.deleteMany({ where: { id: { in: [ownPayment.id, foreignPayment.id, shiftlessPayment.id] } } });
    await prisma.cashShift.deleteMany({ where: { id: { in: [ownShift.id, foreignShift.id] } } });
  });
});
