import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthzService } from '../src/authz/authz.service';
import { RateLimitModule } from '../src/rate-limit/rate-limit.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { SupportController } from '../src/support/support.controller';
import { SupportService } from '../src/support/support.service';

/**
 * S-08 — что именно анонимный вызывающий узнаёт из ошибки.
 *
 * Находка требовала «обобщить 400-ки class-validator, чтобы не перечислять поля
 * схемы». Проверено на живом проде — утечки нет, и требование в исходном виде
 * неоправданно:
 *
 *   POST /api/auth/otp/request {} →
 *   {"message":["phone must be 9-15 digits, optional leading +"], …}
 *
 * Это имя поля и его формат — ровно то, что и так написано на форме входа.
 * Обобщить их значило бы сломать обработку ошибок у витрины, POS и iOS ради
 * сокрытия того, что видно в UI. Настоящая граница проходит не по именам полей,
 * а по трём вещам, которых в ответе быть не должно ни при каких условиях:
 *
 *   1. присланное значение (иначе пароль/код уезжает в лог прокси и в Sentry),
 *   2. стектрейс и внутренние пути,
 *   3. лишние поля конверта ошибки, по которым читается устройство сервиса.
 *
 * Тест закрепляет именно это. Он ловит регрессию, которая иначе прошла бы
 * незаметно: достаточно кому-то добавить `message: \`bad value: ${value}\``.
 */
describe('Публичные ошибки не раскрывают лишнего (S-08)', () => {
  let app: INestApplication;
  const PROBE = 'SECRET-PROBE-VALUE-9f3a';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), RateLimitModule],
      controllers: [SupportController],
      providers: [
        {
          provide: SupportService,
          useValue: {
            open: async () => ({ id: 'ticket-1' }),
            list: async () => [],
          },
        },
        { provide: StaffAuthService, useValue: { me: async () => ({ id: 'staff-1' }) } },
        { provide: AuthzService, useValue: { can: async () => true } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    // Ровно та конфигурация, что в main.ts — иначе тест проверяет не прод.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('ошибка валидации не возвращает присланное значение', async () => {
    const res = await request(app.getHttpServer())
      .post('/support/tickets')
      .send({ customerId: 'c-1', channel: PROBE, subject: 's' })
      .expect(400);

    expect(JSON.stringify(res.body)).not.toContain(PROBE);
  });

  it('конверт ошибки не содержит стектрейса и внутренних путей', async () => {
    const res = await request(app.getHttpServer())
      .post('/support/tickets')
      .send({})
      .expect(400);

    expect(Object.keys(res.body).sort()).toEqual(['error', 'message', 'statusCode']);
    const payload = JSON.stringify(res.body);
    expect(payload).not.toContain('/apps/api');
    expect(payload).not.toContain('node_modules');
    expect(payload).not.toMatch(/\bat\s+\w+\s+\(/); // фрейм стектрейса
  });

  it('имена полей и формат — остаются: это контракт для клиентов, не утечка', async () => {
    const res = await request(app.getHttpServer())
      .post('/support/tickets')
      .send({})
      .expect(400);

    // Витрина, POS и iOS показывают пользователю, какое поле не заполнено.
    // Убрать это — сломать их, ничего не защитив.
    expect(res.body.message.join(' ')).toContain('subject');
  });
});
