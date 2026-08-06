import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { BusinessAuthService } from '../src/business/business-auth.service';
import { BusinessProductsService } from '../src/business/business-products.service';
import { SellersService } from '../src/sellers/sellers.service';
import type { AuthPrincipal } from '../src/auth/jwt.strategy';

/**
 * AliStore Business, срез 2 — кабинет партнёра как отдельное приложение.
 *
 * Партнёр не имеет отношения к ERP, POS и кассе. Это не организационная
 * формальность, а граница безопасности: общий контур прав означал бы, что одна
 * забытая проверка роли открывает чужому магазину склад и деньги AliStore.
 *
 * Поэтому у партнёра свой `typ` токена, и тесты ниже проверяют границу с обеих
 * сторон: staff-токен не попадает в кабинет, seller-токен не попадает никуда,
 * кроме своего ассортимента.
 */
describe('AliStore Business: кабинет партнёра', () => {
  let prisma: PrismaService;
  let auth: BusinessAuthService;
  let products: BusinessProductsService;
  let sellers: SellersService;
  let seq = 0;

  const sellerPrincipal = (sellerId: string): AuthPrincipal =>
    ({ typ: 'seller', customerId: 'su-1', sellerId }) as unknown as AuthPrincipal;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    auth = new BusinessAuthService(prisma);
    products = new BusinessProductsService(prisma, audit);
    sellers = new SellersService(prisma, audit, auth);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.product.deleteMany({ where: { sku: { startsWith: 'BIZ-' } } });
    await prisma.sellerUser.deleteMany({});
    await prisma.seller.deleteMany({});
  });

  async function seedSellerWithUser(name: string) {
    seq += 1;
    const seller = await prisma.seller.create({ data: { name, slug: `${name.toLowerCase()}-${seq}` } });
    const user = await auth.createUser(seller.id, `user-${seq}`, 'СильныйПароль123');
    return { seller, user };
  }

  async function seedProduct(sku: string, sellerId: string | null, price = 10_000) {
    return prisma.product.create({
      data: { sku, name: `Товар ${sku}`, price, cost: 8_000, category: 'Смартфоны', attrs: {}, sellerId },
    });
  }

  it('партнёр входит своим логином и получает область своего магазина', async () => {
    const { seller } = await seedSellerWithUser('Альфа');
    const session = await auth.login(`user-${seq}`, 'СильныйПароль123');
    expect(session.sellerId).toBe(seller.id);
    expect(session.typ).toBe('seller');
  });

  it('неверный пароль не пускает', async () => {
    await seedSellerWithUser('Альфа');
    await expect(auth.login(`user-${seq}`, 'неверный')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('выключенный пользователь не входит', async () => {
    const { user } = await seedSellerWithUser('Альфа');
    await prisma.sellerUser.update({ where: { id: user.id }, data: { active: false } });
    await expect(auth.login(`user-${seq}`, 'СильныйПароль123')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('список кабинета показывает только свои позиции', async () => {
    const a = await seedSellerWithUser('Альфа');
    const b = await seedSellerWithUser('Бета');
    await seedProduct('BIZ-A-1', a.seller.id);
    await seedProduct('BIZ-B-1', b.seller.id);
    await seedProduct('BIZ-HOUSE', null);

    const mine = await products.list(sellerPrincipal(a.seller.id));
    expect(mine.map((row) => row.sku)).toEqual(['BIZ-A-1']);
  });

  it('партнёр меняет цену своей позиции', async () => {
    const a = await seedSellerWithUser('Альфа');
    const own = await seedProduct('BIZ-A-2', a.seller.id, 10_000);

    const updated = await products.updatePrice(sellerPrincipal(a.seller.id), own.id, 12_500);
    expect(updated.price).toBe(12_500);
  });

  it('ответ на смену цены не отдаёт закупочную цену и внутренние поля', async () => {
    // Prisma без `select` возвращает строку целиком, и партнёр видел бы `cost` —
    // то есть вашу маржу — плюс `supplierId` и `sellerId`. Список уже отдаёт
    // узкую проекцию; ответ на запись обязан отдавать ровно ту же.
    const a = await seedSellerWithUser('Альфа');
    const own = await seedProduct('BIZ-A-5', a.seller.id, 10_000);

    const updated = await products.updatePrice(sellerPrincipal(a.seller.id), own.id, 11_000);
    expect(Object.keys(updated).sort()).toEqual(
      ['archived', 'category', 'id', 'name', 'price', 'sku'],
    );
  });

  it('партнёр не меняет чужую цену — позиция для него не существует', async () => {
    const a = await seedSellerWithUser('Альфа');
    const b = await seedSellerWithUser('Бета');
    const foreign = await seedProduct('BIZ-B-2', b.seller.id);

    await expect(products.updatePrice(sellerPrincipal(a.seller.id), foreign.id, 1))
      .rejects.toBeInstanceOf(NotFoundException);
    const untouched = await prisma.product.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(untouched.price).toBe(10_000);
  });

  it('партнёр не дотягивается до товара AliStore', async () => {
    const a = await seedSellerWithUser('Альфа');
    const house = await seedProduct('BIZ-HOUSE-2', null);
    await expect(products.updatePrice(sellerPrincipal(a.seller.id), house.id, 1))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('staff-токен в кабинет не попадает вовсе', async () => {
    // Граница с другой стороны: кабинет — не «ERP с урезанными правами».
    // Сотрудник AliStore ведёт каталог своими экранами, а не этими.
    const a = await seedSellerWithUser('Альфа');
    await seedProduct('BIZ-A-3', a.seller.id);
    const asStaff = { typ: 'staff', customerId: 'staff-1', role: 'owner' } as unknown as AuthPrincipal;
    await expect(products.list(asStaff)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('клиентский токен в кабинет не попадает', async () => {
    const asCustomer = { typ: 'customer', customerId: 'c1' } as unknown as AuthPrincipal;
    await expect(products.list(asCustomer)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('цена ниже единицы отвергается', async () => {
    // Ноль и отрицательная цена — не «скидка», а дыра в выручке.
    const a = await seedSellerWithUser('Альфа');
    const own = await seedProduct('BIZ-A-4', a.seller.id);
    await expect(products.updatePrice(sellerPrincipal(a.seller.id), own.id, 0)).rejects.toBeTruthy();
  });

  it('владелец заводит магазин и его первый логин', async () => {
    // Без этого партнёра можно было завести только скриптом или прямой записью
    // в базу — то есть в обход прав, аудита и любой проверки.
    const created = await sellers.onboard(
      { name: 'Мобайл Плюс', slug: 'mobile-plus', username: 'mobileplus', password: 'ДемоПароль2026' },
      'owner-1',
    );
    expect(created.seller.name).toBe('Мобайл Плюс');
    expect(created.username).toBe('mobileplus');

    // Логин сразу рабочий — иначе «завёл» означало бы «наполовину завёл».
    const session = await auth.login('mobileplus', 'ДемоПароль2026');
    expect(session.sellerId).toBe(created.seller.id);
  });

  it('пароль партнёра не возвращается наружу ни в каком виде', async () => {
    const created = await sellers.onboard(
      { name: 'Альфа', slug: 'alfa-secret', username: 'alfauser', password: 'ДемоПароль2026' },
      'owner-1',
    );
    expect(JSON.stringify(created)).not.toContain('ДемоПароль2026');
    expect(JSON.stringify(created)).not.toContain('passwordHash');
  });

  it('повторный slug отвергается — два магазина с одной ссылкой это коллизия', async () => {
    // Логины разные и валидные: иначе тест упал бы на длине логина и «прошёл»,
    // ничего не сказав про slug.
    await sellers.onboard({ name: 'Альфа', slug: 'dup', username: 'dupuser1', password: 'ДемоПароль2026' }, 'owner-1');
    await expect(
      sellers.onboard({ name: 'Бета', slug: 'dup', username: 'dupuser2', password: 'ДемоПароль2026' }, 'owner-1'),
    ).rejects.toThrow(/[Сс]сылка/);
  });

  it('повторный логин отвергается — иначе второй магазин перехватил бы вход первого', async () => {
    await sellers.onboard({ name: 'Альфа', slug: 's1', username: 'sameuser', password: 'ДемоПароль2026' }, 'owner-1');
    await expect(
      sellers.onboard({ name: 'Бета', slug: 's2', username: 'sameuser', password: 'ДемоПароль2026' }, 'owner-1'),
    ).rejects.toThrow(/[Лл]огин/);
  });

  it('заведение магазина пишется в Event Ledger', async () => {
    const created = await sellers.onboard(
      { name: 'Гамма', slug: 'gamma', username: 'gammauser', password: 'ДемоПароль2026' },
      'owner-42',
    );
    const event = await prisma.auditEvent.findFirst({
      where: { refs: { has: created.seller.id } },
      orderBy: { ts: 'desc' },
    });
    expect(event?.actor).toBe('owner-42');
    expect(event?.payload).toMatchObject({ name: 'Гамма', slug: 'gamma' });
  });

  it('две одновременные правки цены не рвут цепочку previousPrice в леджере', async () => {
    // Леджер обещает ответ на вопрос «с какой цены на какую и кто уронил».
    // Без сериализации две правки читают одну и ту же исходную цену, и обе
    // пишут previousPrice = исходная: по событиям выходит, что цена дважды
    // менялась с 10 000, хотя на деле шла цепочкой. Восстановить историю по
    // такому леджеру нельзя — а это единственное, ради чего он ведётся.
    const { seller } = await seedSellerWithUser('Альфа');
    const product = await seedProduct('BIZ-RACE', seller.id, 10_000);
    const actor = sellerPrincipal(seller.id);
    await prisma.auditEvent.deleteMany({ where: { refs: { has: product.id } } });

    const targets = [9_500, 9_000, 8_500, 8_000, 7_500, 7_000, 6_500, 6_000];
    await Promise.all(targets.map((next) => products.updatePrice(actor, product.id, next)));

    const events = await prisma.auditEvent.findMany({
      where: { type: 'price.changed', refs: { has: product.id } },
      orderBy: { ts: 'asc' },
    });
    expect(events).toHaveLength(targets.length);

    // Цепочка: previousPrice второго события обязан равняться price первого.
    // Сравниваем именно так, а не с конкретными числами: какая из двух правок
    // придёт первой — гонка, и закреплять её порядок значило бы писать тест
    // под текущее везение планировщика.
    const chain = events.map((e) => e.payload as { previousPrice: number; price: number });
    expect(chain[0].previousPrice).toBe(10_000);
    for (let i = 1; i < chain.length; i += 1) {
      expect(chain[i].previousPrice).toBe(chain[i - 1].price);
    }

    const finalPrice = await prisma.product.findUnique({ where: { id: product.id } });
    expect(finalPrice?.price).toBe(chain[chain.length - 1].price);
  });

  it('лок держится по товару, а не по магазину — разные позиции не ждут друг друга', async () => {
    // Сериализация правок одной позиции нужна ради леджера. Но если ключ лока
    // взять по магазину, партнёр с большим ассортиментом получит очередь на
    // ровном месте: правки разных товаров начнут ждать друг друга без всякой
    // на то причины. Проверяем, что одновременные правки разных позиций
    // действительно идут одновременно, а не по очереди.
    const { seller } = await seedSellerWithUser('Альфа');
    const a = await seedProduct('BIZ-LOCK-A', seller.id, 10_000);
    const b = await seedProduct('BIZ-LOCK-B', seller.id, 20_000);
    const actor = sellerPrincipal(seller.id);

    // Занимаем лок товара A снаружи, в своей транзакции, и держим его. Правка
    // A обязана ждать, правка B — пройти, не дожидаясь освобождения.
    let releaseHeldLock: () => void = () => {};
    const held = new Promise<void>((resolve) => { releaseHeldLock = resolve; });
    const holding = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'business-product-price:' + a.id}))::text AS locked`;
      await held;
    }, { timeout: 15_000 });

    // Даём захвату лока дойти до БД прежде, чем начинаем правки.
    await new Promise((resolve) => setTimeout(resolve, 200));

    let bDone = false;
    const updatingB = products.updatePrice(actor, b.id, 19_000).then((r) => { bDone = true; return r; });
    const updatingA = products.updatePrice(actor, a.id, 9_000);

    await updatingB;
    expect(bDone).toBe(true);
    // A всё ещё не прошла — лок держится снаружи. Если бы ключ был по магазину,
    // B тоже стояла бы здесь и `await updatingB` выше не вернулся бы.
    const aPrice = await prisma.product.findUnique({ where: { id: a.id } });
    expect(aPrice?.price).toBe(10_000);

    releaseHeldLock();
    await holding;
    await updatingA;
    const aAfter = await prisma.product.findUnique({ where: { id: a.id } });
    expect(aAfter?.price).toBe(9_000);
  });
});
