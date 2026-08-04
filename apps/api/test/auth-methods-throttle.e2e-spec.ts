import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { OTP_SENDER } from '../src/auth/otp-sender';
import { NoopOtpSender } from '../src/auth/noop-otp.sender';
import { EMAIL_OTP_SENDER, NoopEmailOtpSender } from '../src/auth/email-otp.sender';
import { resolveTrustProxy } from '../src/config/runtime-security';
import { trackRequestSubject } from '../src/rate-limit/rate-limit.module';

/**
 * Лимит на `GET /auth/methods` — 60/мин.
 *
 * Тест существует, потому что соседний `auth-methods.e2e-spec.ts` поднимает
 * троттлер с `limit: 100` и потому декоратор `@Throttle({limit: 60})` в нём
 * ненаблюдаем: удали его — и там всё останется зелёным. Маршрут публичный и
 * анонимный, а его ответ описывает конфигурацию входов, поэтому лимит здесь
 * единственное, что стоит между ним и дешёвым перебором.
 *
 * Дефолт модуля намеренно задан щедрым (100): будь он равен 60, тест не отличал
 * бы работающий декоратор от общего лимита и проходил бы после его удаления.
 */
describe('GET /auth/methods — лимит запросов', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{
        ttl: 60_000,
        limit: 100,
        getTracker: trackRequestSubject,
      }])],
      controllers: [AuthController],
      providers: [
        AuthService,
        // БД не нужна: ответ собирается только из конфигурации.
        { provide: PrismaService, useValue: {} },
        { provide: JwtService, useValue: {} },
        {
          provide: ConfigService,
          useValue: { get: (name: string) => ({ NODE_ENV: 'production', SMS_PROVIDER: 'disabled' }[name]) },
        },
        { provide: OTP_SENDER, useValue: new NoopOtpSender() },
        { provide: EMAIL_OTP_SENDER, useValue: new NoopEmailOtpSender() },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    // Как в бою: за одним обратным прокси `req.ip` обязан быть адресом клиента,
    // иначе трекер лимита считал бы всех посетителей одним субъектом.
    app.set('trust proxy', resolveTrustProxy((name) => (name === 'NODE_ENV' ? 'production' : undefined)));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('пропускает 60 запросов и отклоняет 61-й', async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await request(app.getHttpServer()).get('/auth/methods').expect(200);
    }
    await request(app.getHttpServer()).get('/auth/methods').expect(429);
  });
});
