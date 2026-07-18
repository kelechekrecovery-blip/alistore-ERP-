import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AuthzModule } from '../src/authz/authz.module';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { ObservabilityModule } from '../src/observability/observability.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';

describe('Observability status dashboard', () => {
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
        AuthzModule,
        StaffAuthModule,
        ObservabilityModule,
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

  async function staffToken(role: 'seller' | 'owner') {
    const staff = await prisma.staffUser.create({
      data: {
        username: `observe-${role}-${RUN}-${Math.random()}`,
        passwordHash: await argon2.hash('pass'),
        role,
      },
    });
    return jwt.sign({ sub: staff.id, typ: 'staff', role });
  }

  it('rejects anonymous callers', async () => {
    await request(app.getHttpServer()).get('/observability/status').expect(401);
  });

  it('rejects staff without the observability permission', async () => {
    const token = await staffToken('seller');
    await request(app.getHttpServer())
      .get('/observability/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns API/worker/outbox status to an owner', async () => {
    const token = await staffToken('owner');
    const response = await request(app.getHttpServer())
      .get('/observability/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.api).toMatchObject({ status: 'ok' });
    expect(typeof response.body.api.uptimeSeconds).toBe('number');
    expect(typeof response.body.api.requestsTotal).toBe('number');
    expect(response.body.alerting).toMatchObject({ enabled: false });
    expect(Array.isArray(response.body.alerting.recent)).toBe(true);
    expect(response.body.outbox).toMatchObject({ pending: expect.any(Number), failed: expect.any(Number) });
    expect(Array.isArray(response.body.workers)).toBe(true);
    expect(response.body.sentry).toMatchObject({ enabled: false });
    // No secrets or config values leak into the dashboard payload.
    expect(JSON.stringify(response.body)).not.toContain(process.env.JWT_SECRET ?? 'dev-insecure-change-me');
  });

  it('reflects outbox/DLQ depth from real rows', async () => {
    const token = await staffToken('owner');
    const before = (
      await request(app.getHttpServer())
        .get('/observability/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
    ).body.outbox;

    await prisma.outboxMessage.createMany({
      data: [
        { channel: 'telegram', recipient: `r-${RUN}-1`, template: 't', payload: {}, status: 'pending' },
        { channel: 'telegram', recipient: `r-${RUN}-2`, template: 't', payload: {}, status: 'pending' },
        { channel: 'telegram', recipient: `r-${RUN}-3`, template: 't', payload: {}, status: 'failed' },
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/observability/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.outbox.pending).toBe(before.pending + 2);
    expect(response.body.outbox.failed).toBe(before.failed + 1);
    expect(typeof response.body.outbox.oldestPendingAgeSeconds).toBe('number');
  });

  it('flags stale worker heartbeats and fresh ones separately', async () => {
    await prisma.workerHeartbeat.upsert({
      where: { id: `jest-fresh-${RUN}` },
      update: {},
      create: { id: `jest-fresh-${RUN}` },
    });
    await prisma.workerHeartbeat.upsert({
      where: { id: `jest-stale-${RUN}` },
      update: {},
      create: { id: `jest-stale-${RUN}` },
    });
    await prisma.$executeRaw`
      UPDATE "WorkerHeartbeat"
      SET "lastSeenAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '1 hour'
      WHERE "id" = ${`jest-stale-${RUN}`}
    `;

    const token = await staffToken('owner');
    const response = await request(app.getHttpServer())
      .get('/observability/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const workers = response.body.workers as Array<{ id: string; stale: boolean; ageSeconds: number }>;
    const fresh = workers.find((worker) => worker.id === `jest-fresh-${RUN}`);
    const stale = workers.find((worker) => worker.id === `jest-stale-${RUN}`);
    expect(fresh).toMatchObject({ stale: false });
    expect(stale).toMatchObject({ stale: true });
    expect(stale!.ageSeconds).toBeGreaterThanOrEqual(3600);
  });
});
