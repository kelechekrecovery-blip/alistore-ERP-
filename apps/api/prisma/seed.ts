import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Dev seed: store point, demo customer, a photo-rich catalogue, IMEI stock, and a
 *  published storefront revision (hero + benefits) so the storefront looks complete. */
const IMG = {
  iphone: '/products/device-phone.png',
  samsung: '/products/device-phone.png',
  macbook: '/products/device-laptop.png',
  ipad: '/products/device-tablet.png',
  airpods: '/products/device-earbuds.png',
  watch: '/products/device-watch.png',
} as const;

interface SeedProduct {
  sku: string;
  name: string;
  price: number;
  cost: number;
  category: string;
  image: string;
  brand: string;
}

const CATALOGUE: SeedProduct[] = [
  // Смартфоны
  { sku: 'IPH-15-128', name: 'iPhone 15 128GB', price: 109900, cost: 92000, category: 'Смартфоны', image: IMG.iphone, brand: 'Apple' },
  { sku: 'IPH-15PRO-256', name: 'iPhone 15 Pro 256GB', price: 149900, cost: 128000, category: 'Смартфоны', image: IMG.iphone, brand: 'Apple' },
  { sku: 'IPH-14-128', name: 'iPhone 14 128GB', price: 84900, cost: 71000, category: 'Смартфоны', image: IMG.iphone, brand: 'Apple' },
  { sku: 'SGS-24-256', name: 'Samsung Galaxy S24 256GB', price: 99900, cost: 82000, category: 'Смартфоны', image: IMG.samsung, brand: 'Samsung' },
  { sku: 'SGS-24U-512', name: 'Samsung Galaxy S24 Ultra 512GB', price: 164900, cost: 139000, category: 'Смартфоны', image: IMG.samsung, brand: 'Samsung' },
  { sku: 'SGA-55-128', name: 'Samsung Galaxy A55 128GB', price: 42900, cost: 34000, category: 'Смартфоны', image: IMG.samsung, brand: 'Samsung' },
  // Ноутбуки
  { sku: 'MBP-14-M3', name: 'MacBook Pro 14" M3', price: 189900, cost: 165000, category: 'Ноутбуки', image: IMG.macbook, brand: 'Apple' },
  { sku: 'MBA-13-M3', name: 'MacBook Air 13" M3', price: 134900, cost: 116000, category: 'Ноутбуки', image: IMG.macbook, brand: 'Apple' },
  { sku: 'MBP-16-M3P', name: 'MacBook Pro 16" M3 Pro', price: 279900, cost: 244000, category: 'Ноутбуки', image: IMG.macbook, brand: 'Apple' },
  // Планшеты
  { sku: 'IPAD-A-11', name: 'iPad Air 11" M2', price: 74900, cost: 62000, category: 'Планшеты', image: IMG.ipad, brand: 'Apple' },
  { sku: 'IPAD-P-11', name: 'iPad Pro 11" M4', price: 119900, cost: 101000, category: 'Планшеты', image: IMG.ipad, brand: 'Apple' },
  { sku: 'IPAD-10', name: 'iPad 10.9" 64GB', price: 46900, cost: 38000, category: 'Планшеты', image: IMG.ipad, brand: 'Apple' },
  // Аудио
  { sku: 'APP-2', name: 'AirPods Pro 2', price: 22900, cost: 17000, category: 'Аудио', image: IMG.airpods, brand: 'Apple' },
  { sku: 'APP-3', name: 'AirPods 3', price: 16900, cost: 12500, category: 'Аудио', image: IMG.airpods, brand: 'Apple' },
  { sku: 'APP-MAX', name: 'AirPods Max', price: 62900, cost: 52000, category: 'Аудио', image: IMG.airpods, brand: 'Apple' },
  // Часы
  { sku: 'AW-9-45', name: 'Apple Watch Series 9 45mm', price: 41900, cost: 34000, category: 'Часы', image: IMG.watch, brand: 'Apple' },
  { sku: 'AW-U2', name: 'Apple Watch Ultra 2', price: 84900, cost: 71000, category: 'Часы', image: IMG.watch, brand: 'Apple' },
  { sku: 'AW-SE-44', name: 'Apple Watch SE 44mm', price: 27900, cost: 21000, category: 'Часы', image: IMG.watch, brand: 'Apple' },
];

const HERO_BENEFITS = [
  { title: 'Гарантия и проверка IMEI', body: 'Каждое устройство проверено и внесено в гарантийный реестр.' },
  { title: 'Доставка 1–2 часа', body: 'По Бишкеку курьером или самовывоз из магазина в центре.' },
  { title: 'Рассрочка 0%', body: 'На 3–12 месяцев без переплаты и скрытых комиссий.' },
  { title: 'Trade-in', body: 'Сдайте старое устройство и получите скидку на новое.' },
];

async function main(): Promise<void> {
  await prisma.storePoint.upsert({
    where: { code: 'center' },
    update: {
      name: 'AliStore Центр',
      address: 'Бишкек, ул. Киевская 95',
      inventoryLocation: 'BISHKEK-1',
      hours: 'Ежедневно 10:00–21:00',
      active: true,
      sortOrder: 10,
    },
    create: {
      code: 'center',
      name: 'AliStore Центр',
      address: 'Бишкек, ул. Киевская 95',
      inventoryLocation: 'BISHKEK-1',
      hours: 'Ежедневно 10:00–21:00',
      pickupInstructions: 'Назовите код выдачи сотруднику',
      active: true,
      sortOrder: 10,
      createdBy: 'seed',
      idempotencyKey: 'seed:store-point:bishkek-1',
    },
  });

  const customer = await prisma.customer.upsert({
    where: { phone: '+996700123456' },
    update: {},
    create: { phone: '+996700123456', name: 'Демо Клиент', consent: true },
  });

  for (const p of CATALOGUE) {
    const attrs = { imageUrl: p.image, brand: p.brand } as const;
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: { price: p.price, cost: p.cost, name: p.name, category: p.category, attrs },
      create: { sku: p.sku, name: p.name, price: p.price, cost: p.cost, category: p.category, attrs },
    });

    // two serialised units in stock per product (IMEI-tracked goods)
    for (let n = 1; n <= 2; n += 1) {
      const imei = `${p.sku}-UNIT-${n}`;
      await prisma.deviceUnit.upsert({
        where: { imei },
        update: {},
        create: {
          imei,
          productId: product.id,
          status: 'in_stock',
          location: 'BISHKEK-1',
          grade: 'A',
        },
      });
    }
  }

  // Published storefront revision — drives the homepage hero, benefits and contacts.
  await prisma.storefrontContentRevision.upsert({
    where: { version: 1 },
    update: {
      status: 'published',
      heroEyebrow: 'Доставка 1–2 часа по Бишкеку',
      heroTitle: 'Техника Apple и Samsung — с гарантией',
      heroBody: 'Новое и Б/У привозное с проверкой по IMEI. Рассрочка 0%, trade-in старого устройства, единый профиль и корзина на сайте и в приложении.',
      heroCtaLabel: 'Открыть каталог',
      heroCtaHref: '/catalog',
      heroImageUrl: IMG.iphone,
      financingText: 'Рассрочка 0% на 3–12 месяцев',
      benefits: HERO_BENEFITS,
      featuredTitle: 'Хиты продаж',
      contactPhone: '+996 700 123 456',
      supportHours: 'Ежедневно 10:00–21:00',
      publishedBy: 'seed',
      publishedAt: new Date(),
    },
    create: {
      version: 1,
      status: 'published',
      heroEyebrow: 'Доставка 1–2 часа по Бишкеку',
      heroTitle: 'Техника Apple и Samsung — с гарантией',
      heroBody: 'Новое и Б/У привозное с проверкой по IMEI. Рассрочка 0%, trade-in старого устройства, единый профиль и корзина на сайте и в приложении.',
      heroCtaLabel: 'Открыть каталог',
      heroCtaHref: '/catalog',
      heroImageUrl: IMG.iphone,
      financingText: 'Рассрочка 0% на 3–12 месяцев',
      aboutTitle: 'О компании',
      aboutBody: 'AliStore — магазин электроники в Бишкеке: новое и привозное Б/У с гарантией, проверкой по IMEI и честной ценой.',
      deliveryTitle: 'Доставка и оплата',
      deliveryBody: 'Курьер по Бишкеку 1–2 часа, самовывоз из центра, оплата картой, наличными и в рассрочку.',
      benefits: HERO_BENEFITS,
      featuredTitle: 'Хиты продаж',
      contactPhone: '+996 700 123 456',
      supportHours: 'Ежедневно 10:00–21:00',
      createdBy: 'seed',
      publishedBy: 'seed',
      publishedAt: new Date(),
    },
  });

  const products = await prisma.product.count();
  const units = await prisma.deviceUnit.count();
  // eslint-disable-next-line no-console
  console.log(
    `Seed done: customer ${customer.phone}, ${products} products, ${units} units in stock, storefront published.`,
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
