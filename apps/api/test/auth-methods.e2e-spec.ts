import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { OTP_SENDER } from '../src/auth/otp-sender';
import { NoopOtpSender } from '../src/auth/noop-otp.sender';
import { EMAIL_OTP_SENDER, NoopEmailOtpSender } from '../src/auth/email-otp.sender';
import { trackRequestSubject } from '../src/rate-limit/rate-limit.module';

/**
 * `GET /auth/methods` поднимает НАСТОЯЩИЕ контроллер и сервис поверх подставного
 * окружения — то есть проверяет и маршрут, и то, что ответ собирается из
 * конфигурации процесса, а не из констант клиента.
 *
 * Маршрут обязан быть публичным: его читает посетитель, который ещё не вошёл, —
 * если он окажется под JwtAuthGuard, экран входа не узнает о доступных каналах
 * никогда.
 */
describe('GET /auth/methods', () => {
  async function boot(env: Record<string, string | undefined>) {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100, getTracker: trackRequestSubject }])],
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: { get: (name: string) => env[name] } },
        // Отправители не участвуют в ответе, но AuthService объявляет их
        // зависимостями — подставляем безобидные заглушки.
        { provide: OTP_SENDER, useValue: new NoopOtpSender() },
        { provide: EMAIL_OTP_SENDER, useValue: new NoopEmailOtpSender() },
      ],
    }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
    return app;
  }

  let app: NestExpressApplication | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('отдаёт живые каналы без авторизации', async () => {
    app = await boot({
      NODE_ENV: 'production',
      SMS_PROVIDER: 'android_gateway',
      APPLE_CLIENT_ID: 'kg.alistore.web',
      APPLE_WEB_CLIENT_ID: 'kg.alistore.web',
      TELEGRAM_BOT_TOKEN: '123:login',
      GOOGLE_CLIENT_ID: 'web.apps.googleusercontent.com',
      GOOGLE_WEB_CLIENT_ID: 'web.apps.googleusercontent.com',
    });

    const response = await request(app.getHttpServer()).get('/auth/methods').expect(200);

    expect(response.body.phone).toEqual({ enabled: true, registers: true });
    expect(response.body.apple.clientId).toBe('kg.alistore.web');
    expect(response.body.telegram.enabled).toBe(true);
    expect(response.body.google).toEqual({
      enabled: true,
      registers: true,
      clientId: 'web.apps.googleusercontent.com',
    });
    expect(response.body.registrationAvailable).toBe(true);
  });

  /**
   * Между витриной и API стоит CDN. Закешированный ответ пережил бы включение
   * канала владельцем: он задал бы переменную в дашборде, а экран входа
   * продолжал бы говорить «входов нет» до истечения чужого кеша.
   */
  it('запрещает кеширование ответа', async () => {
    app = await boot({ NODE_ENV: 'production', SMS_PROVIDER: 'android_gateway' });

    await request(app.getHttpServer())
      .get('/auth/methods')
      .expect(200)
      .expect('Cache-Control', 'no-store');
  });

  /**
   * Слепок боевой конфигурации на сегодня. Экран входа обязан получить отсюда
   * `anyLoginAvailable: false` и сказать посетителю правду, вместо того чтобы
   * рисовать форму, которая ответит 503 после нажатия.
   */
  it('при выключённых каналах честно сообщает, что входов нет', async () => {
    app = await boot({
      NODE_ENV: 'production',
      SMS_PROVIDER: 'disabled',
      AUTH_EMAIL_LOGIN_ENABLED: 'false',
    });

    const response = await request(app.getHttpServer()).get('/auth/methods').expect(200);

    expect(response.body.anyLoginAvailable).toBe(false);
    expect(response.body.registrationAvailable).toBe(false);
  });

  it('публикует валидный review-вход без регистрации и recovery', async () => {
    app = await boot({
      NODE_ENV: 'production',
      SMS_PROVIDER: 'disabled',
      AUTH_REVIEW_PHONE: '+996700000001',
      AUTH_REVIEW_OTP: '424242',
      AUTH_REVIEW_UNTIL: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      AUTH_RECOVERY_OTP_ENABLED: 'true',
    });

    const response = await request(app.getHttpServer()).get('/auth/methods').expect(200);

    expect(response.body.phone).toEqual({ enabled: true, registers: false });
    expect(response.body.recovery).toEqual({ enabled: false });
    expect(response.body.anyLoginAvailable).toBe(true);
    expect(response.body.registrationAvailable).toBe(false);
  });

  /** Секретам здесь не место: наружу уходят флаги и публичный Apple client id. */
  it('не раскрывает ни одного секрета', async () => {
    app = await boot({
      NODE_ENV: 'production',
      SMS_PROVIDER: 'android_gateway',
      SMS_GATEWAY_PASSWORD: 'super-secret-gateway-password',
      SMS_GATEWAY_ENCRYPTION_PASSPHRASE: 'super-secret-passphrase',
      TELEGRAM_BOT_TOKEN: '123:super-secret-bot-token',
      SMTP_PASS: 'super-secret-smtp',
      JWT_SECRET: 'super-secret-jwt',
      APPLE_CLIENT_ID: 'kg.alistore.web',
      APPLE_WEB_CLIENT_ID: 'kg.alistore.web',
      GOOGLE_CLIENT_ID: 'google-public-client-id,super-secret-looking-but-public-client-id',
      GOOGLE_WEB_CLIENT_ID: 'google-public-client-id',
    });

    const response = await request(app.getHttpServer()).get('/auth/methods').expect(200);

    expect(JSON.stringify(response.body)).not.toMatch(/super-secret/);
    expect(response.body.google.clientId).toBe('google-public-client-id');
  });
});
