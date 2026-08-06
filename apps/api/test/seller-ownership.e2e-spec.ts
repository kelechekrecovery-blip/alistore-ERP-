import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { CatalogService } from '../src/catalog/catalog.service';
import { SellersService } from '../src/sellers/sellers.service';
import { BusinessAuthService } from '../src/business/business-auth.service';
import { sellerScopeFor } from '../src/sellers/seller-scope';
import type { AuthPrincipal } from '../src/auth/jwt.strategy';

/**
 * AliStore Business, срез 1 — у товара появляется хозяин.
 *
 * Главный инвариант: продавец никогда не видит и не меняет чужую строку. Он
 * проверяется здесь, на уровне данных, а не в вёрстке кабинета: экран можно
 * обойти запросом, а запрос — нет.
 *
 * Второй инвариант не менее важен: товары AliStore (`sellerId = null`) ведут
 * себя ровно как до этой миграции. «Ничего не сломалось» — это утверждение,
 * которое обязано быть проверено, а не подразумеваться.
 */
describe('AliStore Business: владение товаром и изоляция продавцов', () => {
  let prisma: PrismaService;
  let catalog: CatalogService;
  let sellers: SellersService;
  let seq = 0;

  const staffOf = (sellerId: string | null): AuthPrincipal =>
    ({ typ: 'staff', customerId: 'staff-x', role: 'admin', sellerId }) as unknown as AuthPrincipal;

  beforeAll(async () => {
    delete process.env.MEILI_HOST;
    delete process.env.SEARCH_ADMIN_TOKEN;
    prisma = new PrismaService();
    await prisma.$connect();
    catalog = new CatalogService(prisma, new ConfigService());
    const audit = new AuditService(prisma);
    sellers = new SellersService(prisma, audit, new BusinessAuthService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedSeller(name: string) {
    seq += 1;
    return prisma.seller.create({ data: { name, slug: `${name.toLowerCase()}-${seq}` } });
  }

  async function seedProduct(sku: string, sellerId: string | null) {
    return prisma.product.create({
      data: { sku, name: `Товар ${sku}`, price: 10_000, cost: 8_000, category: 'Смартфоны', attrs: {}, sellerId, published: true },
    });
  }

  beforeEach(async () => {
    await prisma.product.deleteMany({ where: { sku: { startsWith: 'SELLER-' } } });
    await prisma.seller.deleteMany({});
  });

  it('товар, созданный как раньше, принадлежит AliStore', async () => {
    // Никакого UPDATE по существующим строкам миграция не делает — «свой» товар
    // остаётся своим просто потому, что колонка пуста.
    const product = await seedProduct('SELLER-OWN-1', null);
    expect(product.sellerId).toBeNull();
  });

  it('каталог не помечает товар AliStore продавцом', async () => {
    // Подписывать каждую карточку «AliStore» — навязывать шум там, где его нет.
    await seedProduct('SELLER-OWN-2', null);
    const found = await catalog.search({ q: 'SELLER-OWN-2' } as never);
    const item = found.items.find((row) => row.sku === 'SELLER-OWN-2');
    expect(item).toBeDefined();
    expect(item?.seller).toBeUndefined();
  });

  it('каталог отдаёт продавца у чужого товара', async () => {
    const partner = await seedSeller('Партнёр');
    await seedProduct('SELLER-P-1', partner.id);
    const found = await catalog.search({ q: 'SELLER-P-1' } as never);
    const item = found.items.find((row) => row.sku === 'SELLER-P-1');
    expect(item?.seller).toEqual({ id: partner.id, name: 'Партнёр' });
  });

  it('продавец A не видит товар продавца B — как отсутствующий, а не запрещённый', async () => {
    // 404, а не 403: «запрещено» подтверждает, что такой товар существует, и
    // перебором id чужой ассортимент восстанавливается по одному ответу.
    const a = await seedSeller('Альфа');
    const b = await seedSeller('Бета');
    const foreign = await seedProduct('SELLER-B-1', b.id);
    await expect(sellers.assertOwns(a.id, foreign.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('продавец распоряжается своим товаром', async () => {
    const a = await seedSeller('Альфа');
    const own = await seedProduct('SELLER-A-1', a.id);
    await expect(sellers.assertOwns(a.id, own.id)).resolves.toBeDefined();
  });

  it('продавец не дотягивается до товара AliStore', async () => {
    const a = await seedSeller('Альфа');
    const house = await seedProduct('SELLER-OWN-3', null);
    await expect(sellers.assertOwns(a.id, house.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('дельта-синк не отдаёт внутренний идентификатор продавца', async () => {
    // `delta()` — основной путь синхронизации web и POS, дёргается регулярно и
    // публично. Он строил DTO напрямую, минуя обогащение, и отдавал сырой
    // `sellerId` анонимному запросу.
    const partner = await seedSeller('Партнёр');
    await seedProduct('SELLER-D-1', partner.id);
    const delta = await catalog.delta({ since: new Date(Date.now() - 60_000).toISOString() } as never);
    const item = delta.changed.find((row) => row.sku === 'SELLER-D-1');
    expect(item).toBeDefined();
    expect('sellerId' in (item as object)).toBe(false);
    expect(item?.seller).toEqual({ id: partner.id, name: 'Партнёр' });
  });

  it('подборка витрины не отдаёт внутренний идентификатор продавца', async () => {
    const partner = await seedSeller('Партнёр');
    const product = await seedProduct('SELLER-C-1', partner.id);
    const curated = await catalog.curated([product.id]);
    expect('sellerId' in (curated[0] as object)).toBe(false);
    expect(curated[0]?.seller).toEqual({ id: partner.id, name: 'Партнёр' });
  });

  it('владелец AliStore не ограничен продавцом, сотрудник магазина ограничен', () => {
    // Один резолвер решает область видимости для всех запросов: `null` значит
    // «без ограничения», строка — «только этот продавец».
    expect(sellerScopeFor(staffOf(null))).toBeNull();
    expect(sellerScopeFor(staffOf('seller-42'))).toBe('seller-42');
  });

  it('клиентский токен не получает область продавца вовсе', () => {
    const asCustomer = { typ: 'customer', customerId: 'c1' } as unknown as AuthPrincipal;
    expect(sellerScopeFor(asCustomer)).toBeNull();
  });
});
