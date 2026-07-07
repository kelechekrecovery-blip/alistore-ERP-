import { INestApplication } from '@nestjs/common';
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
      providers: [{ provide: PrismaService, useValue: prisma }],
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
});
