import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MemoryHealthIndicator, TerminusModule } from '@nestjs/terminus';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { AuditModule } from '../src/audit/audit.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { AuthzModule } from '../src/authz/authz.module';
import { HealthController } from '../src/health/health.controller';

/**
 * Health endpoints (@nestjs/terminus) against a real Postgres — the DB ping must
 * actually reach the database.
 */
describe('Health (terminus)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const memory = {
    checkHeap: jest.fn().mockResolvedValue({ memory_heap: { status: 'up' } }),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      // `/health/integrations` is staff-gated, so the controller's guards need
      // staff auth and the permission engine even in this focused suite.
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TerminusModule,
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        AuthzModule,
      ],
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    })
      .overrideProvider(MemoryHealthIndicator)
      .useValue(memory)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('GET /health → ok with the database up', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.details.database.status).toBe('up');
  });

  it('GET /health/live → ok (liveness)', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health/ready → DB and heap readiness', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(response.body.status).toBe('ok');
    expect(memory.checkHeap).toHaveBeenCalledWith('memory_heap', 1536 * 1024 * 1024);
  });

  it('GET /health/integrations → staff-only, no secret values', async () => {
    // Anonymous callers must not get the list of unconfigured integrations.
    await request(app.getHttpServer()).get('/health/integrations').expect(401);

    const staffAuth = app.get(StaffAuthService);
    const username = `owner-health-${Math.floor(Math.random() * 1_000_000)}`;
    await staffAuth.createStaff(username, 'pass', 'owner');
    const { accessToken } = await staffAuth.login(username, 'pass');

    const res = await request(app.getHttpServer())
      .get('/health/integrations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body.checks).toEqual(expect.any(Array));
    expect(res.body.checks.some((check: { id: string }) => check.id === 'pos_hardware'))
      .toBe(true);
    if (process.env.AI_PROVIDER_KEY) {
      expect(JSON.stringify(res.body)).not.toContain(process.env.AI_PROVIDER_KEY);
    }
  });
});
