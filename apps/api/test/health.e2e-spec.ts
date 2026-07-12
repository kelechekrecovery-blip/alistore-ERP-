import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { HealthController } from '../src/health/health.controller';

/**
 * Health endpoints (@nestjs/terminus) against a real Postgres — the DB ping must
 * actually reach the database.
 */
describe('Health (terminus)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (name: string) => process.env[name] } },
      ],
    }).compile();
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
  });

  it('GET /health/integrations → external readiness without secret values', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/integrations')
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
