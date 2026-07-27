import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RateLimitModule } from '../src/rate-limit/rate-limit.module';
import { StaffAuthController } from '../src/staff-auth/staff-auth.controller';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { AuthzService } from '../src/authz/authz.service';
import { isStaffBootstrapAvailable } from '../src/staff-auth/staff-bootstrap-availability';

/**
 * S-04 / F-11 — одноразовое создание первого владельца недоступно в проде.
 *
 * Сейчас маршрут закрыт только состоянием базы: `bootstrapOwner` отказывает,
 * когда персонал уже есть. На проде это выполняется (проверено:
 * `bootstrap-status` отдаёт `needsBootstrap:false`), то есть находка **не
 * эксплуатируется**. Но защита держится на данных, а не на конфигурации: любой
 * сценарий, оставивший таблицу персонала пустой — восстановление из неполного
 * дампа, миграция, ошибочный `deleteMany` — открывает публичный маршрут,
 * создающий владельца всей системы. Тому, кто успеет первым.
 *
 * Поэтому вторая, независимая защёлка: в production маршрута просто нет.
 * Именно 404, а не 403 — 403 подтверждает, что маршрут существует.
 *
 * Клапан для честного первого развёртывания — `STAFF_BOOTSTRAP_ENABLED=true`:
 * владелец открывает окно осознанно и закрывает после. Без него production
 * не отдаёт bootstrap никогда.
 */
describe('Bootstrap первого владельца закрыт в production (S-04/F-11)', () => {
  describe('resolver', () => {
    const env = (values: Record<string, string | undefined>) =>
      (name: string) => values[name];

    it('вне production — доступен (локальная разработка и тесты)', () => {
      expect(isStaffBootstrapAvailable(env({ NODE_ENV: 'development' }))).toBe(true);
      expect(isStaffBootstrapAvailable(env({}))).toBe(true);
    });

    it('в production — закрыт по умолчанию', () => {
      expect(isStaffBootstrapAvailable(env({ NODE_ENV: 'production' }))).toBe(false);
    });

    it('в production открывается только явным флагом', () => {
      expect(
        isStaffBootstrapAvailable(env({ NODE_ENV: 'production', STAFF_BOOTSTRAP_ENABLED: 'true' })),
      ).toBe(true);
      // Никаких «почти true» — только точное значение.
      expect(
        isStaffBootstrapAvailable(env({ NODE_ENV: 'production', STAFF_BOOTSTRAP_ENABLED: '1' })),
      ).toBe(false);
      expect(
        isStaffBootstrapAvailable(env({ NODE_ENV: 'production', STAFF_BOOTSTRAP_ENABLED: 'yes' })),
      ).toBe(false);
    });
  });

  describe('маршруты', () => {
    let app: INestApplication;
    const staffAuth = {
      needsBootstrap: jest.fn().mockResolvedValue(true),
      bootstrapOwner: jest.fn().mockResolvedValue({ id: 's-1', username: 'o', role: 'owner' }),
      publicView: (staff: { id: string; username: string; role: string }) => staff,
    };
    const original = process.env.NODE_ENV;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true }), RateLimitModule],
        controllers: [StaffAuthController],
        providers: [
          { provide: StaffAuthService, useValue: staffAuth },
          { provide: AuthzService, useValue: { can: async () => true } },
        ],
      }).compile();
      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      await app.init();
    });

    afterAll(async () => {
      process.env.NODE_ENV = original;
      await app.close();
    });

    afterEach(() => {
      process.env.NODE_ENV = original;
      delete process.env.STAFF_BOOTSTRAP_ENABLED;
    });

    it('вне production bootstrap работает как раньше', async () => {
      process.env.NODE_ENV = 'test';

      await request(app.getHttpServer()).get('/staff-auth/bootstrap-status').expect(200);
      await request(app.getHttpServer())
        .post('/staff-auth/bootstrap')
        .send({ username: 'owner-x', password: 'Str0ng-Pass!26' })
        .expect(201);
      expect(staffAuth.bootstrapOwner).toHaveBeenCalled();
    });

    it('в production оба маршрута отвечают 404 — даже при пустой базе', async () => {
      process.env.NODE_ENV = 'production';
      staffAuth.bootstrapOwner.mockClear();
      // Именно этот случай и опасен: база пуста, старая защита пропустила бы.
      staffAuth.needsBootstrap.mockResolvedValue(true);

      await request(app.getHttpServer()).get('/staff-auth/bootstrap-status').expect(404);
      await request(app.getHttpServer())
        .post('/staff-auth/bootstrap')
        .send({ username: 'attacker', password: 'longenough1' })
        .expect(404);

      // Владелец не создан.
      expect(staffAuth.bootstrapOwner).not.toHaveBeenCalled();
    });

    it('в production с явным флагом — снова доступен', async () => {
      process.env.NODE_ENV = 'production';
      process.env.STAFF_BOOTSTRAP_ENABLED = 'true';

      await request(app.getHttpServer()).get('/staff-auth/bootstrap-status').expect(200);
    });
  });
});
