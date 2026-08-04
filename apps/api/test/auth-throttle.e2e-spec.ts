import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { resolveTrustProxy } from '../src/config/runtime-security';
import { trackRequestSubject } from '../src/rate-limit/rate-limit.module';

/**
 * Rate limiting on the OTP endpoints (anti SMS-bomb / cost abuse). Boots the REAL
 * AuthController with a mocked AuthService (no DB) and asserts the 4th
 * /auth/otp/request within the window is rejected with 429.
 */
describe('Auth throttling', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      // Тот же трекер, что и в бою (rate-limit.module.ts): иначе тест проверял
      // бы конфигурацию, с которой сервис не работает.
      imports: [ThrottlerModule.forRoot([{
        ttl: 60_000,
        limit: 100,
        getTracker: trackRequestSubject,
      }])],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            requestOtp: async () => ({ challengeId: 'stub' }),
            verifyOtp: async () => ({}),
            requestRecoveryOtp: async () => ({ challengeId: 'stub' }),
            verifyRecoveryOtp: async () => ({}),
            refresh: async () => ({}),
            logout: async () => undefined,
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    // Зеркалит боевую настройку из main.ts: за одним обратным прокси
    // (cloudflared сегодня, Render завтра) req.ip обязан быть адресом клиента,
    // а не прокси. Значение берётся тем же хелпером, что и в проде.
    app.set('trust proxy', resolveTrustProxy((name) => (name === 'NODE_ENV' ? 'production' : undefined)));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows 3 OTP requests then returns 429 on the 4th', async () => {
    const server = app.getHttpServer();
    const body = { phone: '+996700000000' };
    for (let i = 0; i < 3; i += 1) {
      await request(server).post('/auth/otp/request').send(body).expect(201);
    }
    await request(server).post('/auth/otp/request').send(body).expect(429);
  });

  /**
   * Проверка выше бьёт одним клиентом и потому не видела главного: тречение шло
   * по `req.ip`, а за обратным прокси (cloudflared сегодня, Render завтра) он
   * равен адресу самого прокси — то есть у всей планеты был ОДИН общий бакет.
   * Следствие — не обход лимита, а глобальный выключатель: три запроса гасили
   * вход по SMS всем клиентам сразу. То же самое касалось входа сотрудников,
   * оформления заказов, кассы и приёма Evidence.
   *
   * Условие корректности: разные клиенты — разные бакеты, и при этом
   * подделать себе новый бакет заголовком нельзя (за это отвечает `trust proxy`
   * с фиксированным числом доверенных хопов, а не слепое чтение X-Forwarded-For).
   */
  it('разделяет бакеты по реальному клиенту, а не по адресу прокси', async () => {
    const server = app.getHttpServer();
    const body = { phone: '+996700000001' };
    const exhausted = '203.0.113.10';
    const other = '203.0.113.11';

    for (let i = 0; i < 3; i += 1) {
      await request(server)
        .post('/auth/otp/request')
        .set('X-Forwarded-For', exhausted)
        .send(body)
        .expect(201);
    }
    await request(server)
      .post('/auth/otp/request')
      .set('X-Forwarded-For', exhausted)
      .send(body)
      .expect(429);

    // Второй покупатель не должен пострадать от первого.
    await request(server)
      .post('/auth/otp/request')
      .set('X-Forwarded-For', other)
      .send(body)
      .expect(201);
  });
});
