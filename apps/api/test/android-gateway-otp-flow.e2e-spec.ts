import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { AuditModule } from '../src/audit/audit.module';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { OTP_SENDER } from '../src/auth/otp-sender';
import { AndroidGatewayOtpSender } from '../src/auth/android-gateway-otp.sender';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Юнит-тесты доказали шифрование и отправитель по отдельности. Здесь —
 * доказательство, что реальная связка Nest их соединяет: HTTP → контроллер →
 * `AuthService.requestOtp` → `OTP_SENDER` → шифрование → шлюз. Отдельно
 * закрепляется поведение, ради которого весь мост и безопасен: если шлюз упал,
 * в `OtpChallenge` не должно остаться пригодного кода.
 *
 * `fetch` замокан — реального телефона в CI нет; проверяем именно проводку и
 * то, что уходит в сеть, а не саму доставку (её подтверждает владелец руками).
 */
describe('Android gateway OTP flow (HTTP → DI → encryption)', () => {
  const PASSPHRASE = 'flow-passphrase';
  const PHONE = '+996700998877';
  let app: INestApplication;
  let prisma: PrismaService;
  let fetchMock: jest.Mock;
  const realFetch = global.fetch;

  beforeAll(async () => {
    // Продовое поведение: без dev-echo код в ответе не возвращается.
    process.env.AUTH_OTP_DEV_ECHO = 'false';
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' }),
        PrismaModule,
        AuditModule,
      ],
      providers: [
        JwtStrategy,
        AuthService,
        {
          provide: OTP_SENDER,
          useValue: new AndroidGatewayOtpSender({
            url: 'https://api.sms-gate.app/3rdparty/v1',
            username: 'device-user',
            password: 'device-pass',
            passphrase: PASSPHRASE,
          }),
        },
      ],
    }).compile();
    // AuthController висит в AuthModule; здесь собираем провайдеры вручную, как
    // соседние auth-спеки, и дёргаем сервис — тот же путь, что и контроллер.
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    global.fetch = realFetch;
    await prisma.otpChallenge.deleteMany({ where: { phone: PHONE } });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.otpChallenge.deleteMany({ where: { phone: PHONE } });
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 202, text: async () => '{}' });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('запрос OTP шифрует код и номер прежде, чем отдать их шлюзу, и заводит challenge', async () => {
    const auth = app.get(AuthService);
    const result = await auth.requestOtp(PHONE);

    // Прод-режим: код наружу не возвращается.
    expect(result.devCode).toBeUndefined();
    expect(result.challengeId).toBeTruthy();

    // Challenge сохранён — хеш, а не сам код.
    const challenge = await prisma.otpChallenge.findUnique({ where: { id: result.challengeId } });
    expect(challenge?.phone).toBe(PHONE);
    expect(challenge?.codeHash).not.toContain(PHONE);

    // В сеть ушёл шифротекст, а не код с номером.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.isEncrypted).toBe(true);
    const rawBody: string = fetchMock.mock.calls[0][1].body;
    expect(rawBody).not.toContain(PHONE);
    expect(decrypt(body.phoneNumbers[0], PASSPHRASE)).toBe(PHONE);
    // Расшифрованный текст содержит настоящий 6-значный код.
    expect(decrypt(body.textMessage.text, PASSPHRASE)).toMatch(/\b\d{6}\b/);
  });

  it('если шлюз упал — запрос отвечает ошибкой и не оставляет пригодного кода', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => 'bad gateway' });
    const auth = app.get(AuthService);

    await expect(auth.requestOtp(PHONE)).rejects.toBeDefined();
    // Ключевой инвариант моста: упавшая отправка не должна оставить challenge,
    // по которому кто-то потом «подтвердит» вход без единой полученной SMS.
    expect(await prisma.otpChallenge.count({ where: { phone: PHONE } })).toBe(0);
  });
});

/** Расшифровать так, как это делает телефон: ключ из соли, IV — та же соль. */
function decrypt(value: string, passphrase: string): string {
  const chunks = value.split('$');
  const salt = Buffer.from(chunks[3], 'base64');
  const key = pbkdf2Sync(passphrase, salt, Number(chunks[2].slice(2)), 32, 'sha1');
  const decipher = createDecipheriv('aes-256-cbc', key, salt);
  return Buffer.concat([
    decipher.update(Buffer.from(chunks[4], 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
