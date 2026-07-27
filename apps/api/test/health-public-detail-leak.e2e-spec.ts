import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { HealthCheckError, MemoryHealthIndicator, TerminusModule } from '@nestjs/terminus';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { AuditModule } from '../src/audit/audit.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { AuthzModule } from '../src/authz/authz.module';
import { HealthController } from '../src/health/health.controller';

/**
 * S-07 — публичные health-пробы не описывают внутренности сервиса.
 *
 * Аудит снял с прода `/api/health` и получил перечень компонентов (`database`,
 * `memory_heap`) с их состоянием и порогом кучи. Само по себе это не эксплойт,
 * но это бесплатная карта: анониму видно, из чего собран сервис и какая
 * зависимость сейчас деградирует. Атакующему это подсказывает, куда давить,
 * а деградацию БД превращает в публичный сигнал.
 *
 * Разделение ответственности: **код ответа несёт сигнал, тело не несёт
 * подробностей**. Балансировщику хватает 200/503 — ни один потребитель в
 * репозитории не читает тело (проверено: `keep-site-up`, `deployment-smoke`,
 * `verify-restored-database`, `local-up.sh` смотрят только статус). Диагностика
 * переезжает на staff-only `/health/details` без потерь.
 */
describe('Health — публичные пробы не раскрывают состав сервиса (S-07)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const memory = {
    checkHeap: jest.fn().mockResolvedValue({ memory_heap: { status: 'up' } }),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
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

  beforeEach(() => {
    memory.checkHeap.mockResolvedValue({ memory_heap: { status: 'up' } });
  });

  it.each(['/health', '/health/ready', '/health/live'])(
    'GET %s анониму → только {status:"ok"}, без состава сервиса',
    async (path) => {
      const res = await request(app.getHttpServer()).get(path).expect(200);

      expect(res.body).toEqual({ status: 'ok' });
      const payload = JSON.stringify(res.body);
      expect(payload).not.toContain('database');
      expect(payload).not.toContain('memory_heap');
      expect(payload).not.toContain('details');
    },
  );

  it('деградация зависимости всё ещё даёт 503 — но не говорит, какая именно', async () => {
    memory.checkHeap.mockRejectedValue(
      new HealthCheckError('heap exceeded', {
        memory_heap: { status: 'down', message: 'heap over 1536 MiB' },
      }),
    );

    const res = await request(app.getHttpServer()).get('/health/ready').expect(503);

    // Код ответа — честный сигнал для балансировщика.
    // Тело — не карта внутренностей.
    const payload = JSON.stringify(res.body);
    expect(payload).not.toContain('memory_heap');
    expect(payload).not.toContain('heap over');
    expect(payload).not.toContain('database');
  });

  it('GET /health/details анониму → 401, сотруднику → полная диагностика', async () => {
    await request(app.getHttpServer()).get('/health/details').expect(401);

    const staffAuth = app.get(StaffAuthService);
    const username = `owner-hdetails-${Math.floor(Math.random() * 1_000_000)}`;
    await staffAuth.createStaff(username, 'pass', 'owner');
    const { accessToken } = await staffAuth.login(username, 'pass');

    const res = await request(app.getHttpServer())
      .get('/health/details')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Диагностика не потеряна — она просто больше не публичная.
    expect(res.body.status).toBe('ok');
    expect(res.body.details.database.status).toBe('up');
  });
});
