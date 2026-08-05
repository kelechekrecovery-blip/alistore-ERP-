import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { CatalogService } from '../src/catalog/catalog.service';
import { SettingsService } from '../src/settings/settings.service';

/**
 * QR провайдера, загруженный владельцем в ERP, обязан доехать до карточки товара.
 *
 * Публичного API у Payda, O!Market, ZERO и M+ нет — рассрочку оформляют в
 * магазине по QR, который банк выдал этой точке. Значит весь смысл параметра в
 * том, что он виден покупателю; параметр, который никуда не доходит, — это
 * настройка-обманка. Тест проверяет и обратное: пока QR не загружен, блок
 * «где оформить» не появляется вовсе.
 */
describe('QR рассрочки: из настроек ERP на карточку товара', () => {
  let prisma: PrismaService;
  let settings: SettingsService;
  let catalog: CatalogService;

  const QR_KEYS = [
    'installment.payda.qr_url',
    'installment.omarket.qr_url',
    'installment.zero.qr_url',
    'installment.mplus.qr_url',
  ] as const;

  beforeAll(async () => {
    delete process.env.MEILI_HOST;
    delete process.env.SEARCH_ADMIN_TOKEN;
    prisma = new PrismaService();
    await prisma.$connect();
    settings = new SettingsService(prisma, new AuditService(prisma));
    catalog = new CatalogService(prisma, new ConfigService(), settings);
  });

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key: { in: [...QR_KEYS] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.setting.deleteMany({ where: { key: { in: [...QR_KEYS] } } });
    await prisma.product.deleteMany({ where: { sku: 'QR-TEST-1' } });
    await prisma.product.create({
      data: { sku: 'QR-TEST-1', name: 'Тестовый телефон', price: 24_900, cost: 20_000, category: 'Смартфоны', attrs: {} },
    });
  });

  it('без загруженных QR блок «где оформить» не появляется', async () => {
    const found = await catalog.search({ q: 'Тестовый телефон' } as never);
    const product = found.items.find((item) => item.sku === 'QR-TEST-1');
    expect(product?.installmentProviders).toBeUndefined();
  });

  it('загруженный QR появляется у того провайдера, который тянет эту цену', async () => {
    await settings.set('installment.omarket.qr_url', '/media/qr-omarket.png', 'owner-qr-test');

    const found = await catalog.search({ q: 'Тестовый телефон' } as never);
    const product = found.items.find((item) => item.sku === 'QR-TEST-1');

    expect(product?.installmentProviders).toEqual([
      { id: 'omarket', label: 'O!Market', qrUrl: '/media/qr-omarket.png' },
    ]);
  });

  it('снятый QR убирает провайдера из блока', async () => {
    await settings.set('installment.omarket.qr_url', '/media/qr-omarket.png', 'owner-qr-test');
    await settings.set('installment.omarket.qr_url', '', 'owner-qr-test');

    const found = await catalog.search({ q: 'Тестовый телефон' } as never);
    const product = found.items.find((item) => item.sku === 'QR-TEST-1');
    expect(product?.installmentProviders).toBeUndefined();
  });

  it('провайдер, который эту цену не тянет, QR не показывает', async () => {
    // Payda по договору 3 месяца и потолок 100 000 — цену 24 900 она тянет.
    // Берём цену выше её потолка: код загружен, но присылать по нему нельзя.
    await prisma.product.update({ where: { sku: 'QR-TEST-1' }, data: { price: 150_000 } });
    await settings.set('installment.payda.qr_url', '/media/qr-payda.png', 'owner-qr-test');

    const found = await catalog.search({ q: 'Тестовый телефон' } as never);
    const product = found.items.find((item) => item.sku === 'QR-TEST-1');
    expect(product?.installmentProviders ?? []).not.toContainEqual(
      expect.objectContaining({ id: 'payda' }),
    );
  });
});
