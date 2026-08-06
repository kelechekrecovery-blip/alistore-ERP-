import { ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { BusinessModule } from '../src/business/business.module';
import { BusinessAuthService } from '../src/business/business-auth.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RateLimitModule } from '../src/rate-limit/rate-limit.module';

/**
 * Кабинет партнёра на уровне HTTP.
 *
 * Юнит-тесты вызывают методы сервиса напрямую и поэтому в принципе не видят
 * двух вещей: `BusinessAuthGuard` (он разбирает заголовок и проверяет тип
 * токена — вызов метода до него не доходит) и `@Throttle` на входе (лимитер
 * живёт в HTTP-конвейере). То есть подбор пароля и подделка токена в CI не
 * проверялись вовсе; проверка была только ручная.
 *
 * Замерено на боевом API до написания этого файла: 11-й вход подряд отвечает
 * 429 — защита работает, но держалась ни на чём, кроме удачного резолва DI.
 * `BusinessModule` не импортирует `RateLimitModule`, гвард резолвится лишь
 * потому, что `ThrottlerModule.forRoot` регистрируется глобально. Уберут эту
 * глобальность в библиотеке — декоратор станет украшением, и без теста ниже
 * это заметят по счёту за перебор.
 */
describe('AliStore Business: HTTP-слой кабинета', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let auth: BusinessAuthService;
  const run = Math.floor(Math.random() * 1_000_000);
  const PASSWORD = 'СильныйПарольHTTP2026';

  let sellerId: string;
  let userId: string;
  let productId: string;
  let username: string;

  beforeAll(async () => {
    // `E2E_TEST=true` выключает лимитер целиком (`rate-limit.module.ts:12`).
    // Playwright его ставит, и если он протечёт сюда, тест на 429 станет
    // зелёным, ничего не проверив.
    delete process.env.E2E_TEST;

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, RateLimitModule, BusinessModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
    auth = moduleRef.get(BusinessAuthService);

    const seller = await prisma.seller.create({ data: { name: `HTTP ${run}`, slug: `http-${run}` } });
    sellerId = seller.id;
    username = `http-user-${run}`;
    const user = await auth.createUser(seller.id, username, PASSWORD);
    userId = user.id;
    const product = await prisma.product.create({
      data: { sku: `BIZ-HTTP-${run}`, name: 'Товар HTTP', price: 10_000, cost: 8_000, category: 'Смартфоны', attrs: {}, sellerId },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { sku: { startsWith: `BIZ-HTTP-${run}` } } });
    await prisma.sellerUser.deleteMany({ where: { sellerId } });
    await prisma.seller.deleteMany({ where: { id: sellerId } });
    await app.close();
  });

  /** Токен подписывается тем же секретом, что и боевой — гвард обязан его принять. */
  const sign = (claims: Record<string, unknown>) => jwt.signAsync(claims, { expiresIn: '8h' });

  describe('BusinessAuthGuard', () => {
    it('пускает партнёрский токен', async () => {
      const token = await sign({ sub: userId, typ: 'seller', sellerId });
      const res = await request(app.getHttpServer()).get('/business/products').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.map((p: { sku: string }) => p.sku)).toContain(`BIZ-HTTP-${run}`);
    });

    it.each([
      ['без заголовка', undefined],
      // Значения HTTP-заголовков обязаны быть латиницей: первая версия этого
      // случая несла кириллицу, и Node падал с `Invalid character in header
      // content` ещё до отправки — тест краснел, ничего не проверив.
      ['с мусором вместо токена', 'Bearer not-a-token-at-all'],
      ['с обрезанным JWT', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0'],
      ['со схемой Basic', 'Basic dXNlcjpwYXNz'],
      ['с пустым Bearer', 'Bearer '],
    ])('отказывает %s', async (_name, header) => {
      const req = request(app.getHttpServer()).get('/business/products');
      if (header) req.set('Authorization', header);
      expect((await req).status).toBe(401);
    });

    it('отказывает токену сотрудника, подписанному тем же секретом', async () => {
      // Ключевой случай: подпись верна, секрет тот же — отличается только тип.
      // Если гвард проверяет лишь подпись, staff-токен открывает кабинет.
      const token = await sign({ sub: 'staff-1', typ: 'staff', role: 'owner' });
      const res = await request(app.getHttpServer()).get('/business/products').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });

    it('отказывает токену покупателя', async () => {
      const token = await sign({ sub: 'cust-1', typ: 'customer' });
      expect((await request(app.getHttpServer()).get('/business/products').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    });

    it('отказывает партнёрскому токену без магазина', async () => {
      // `typ` верный, `sellerId` нет. Пустая область — это не «все магазины»:
      // без этой проверки такой токен ушёл бы в сервис и отфильтровал бы
      // каталог по `sellerId: undefined`.
      const token = await sign({ sub: userId, typ: 'seller' });
      expect((await request(app.getHttpServer()).get('/business/products').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    });

    it('отказывает токену, подписанному чужим секретом', async () => {
      const foreign = new JwtService({ secret: 'совсем-другой-секрет-подписи' });
      const token = await foreign.signAsync({ sub: userId, typ: 'seller', sellerId }, { expiresIn: '8h' });
      expect((await request(app.getHttpServer()).get('/business/products').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    });

    it('закрывает и смену цены, а не только список', async () => {
      // Гвард навешивается на каждый маршрут отдельно. Проверять только `GET`
      // значило бы поверить, что про `PATCH` не забыли.
      const res = await request(app.getHttpServer())
        .patch(`/business/products/${productId}/price`)
        .send({ price: 9_000 });
      expect(res.status).toBe(401);
      const untouched = await prisma.product.findUnique({ where: { id: productId } });
      expect(untouched?.price).toBe(10_000);
    });
  });

  describe('защита входа от перебора', () => {
    it('на 11-й попытке отвечает 429, а не продолжает проверять пароли', async () => {
      // Лимит 10/60с (`business.controller.ts`). Считаем по адресу — у всех
      // запросов supertest он один, значит бакет общий.
      const codes: number[] = [];
      for (let i = 0; i < 12; i += 1) {
        const res = await request(app.getHttpServer())
          .post('/business/auth/login')
          .send({ username, password: `неверный-${i}` });
        codes.push(res.status);
      }
      expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
      expect(codes[10]).toBe(429);
      expect(codes[11]).toBe(429);
    });

    it('верный пароль тоже упирается в лимит — перебор не обходится удачной попыткой', async () => {
      // Бакет исчерпан предыдущим тестом. Проверяем, что лимитер стоит перед
      // проверкой пароля: иначе подбор продолжался бы, пока не угадали.
      const res = await request(app.getHttpServer())
        .post('/business/auth/login')
        .send({ username, password: PASSWORD });
      expect(res.status).toBe(429);
    });
  });
});
