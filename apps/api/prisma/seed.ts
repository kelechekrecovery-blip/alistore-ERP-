import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Dev seed: store point, demo customer, a photo- and spec-rich catalogue, IMEI stock,
 *  and a published storefront revision (hero + benefits) so the storefront looks complete. */
/** Per-model artwork so each product reads distinctly in the catalogue. */
const IMG = {
  phone: '/products/device-phone.png',
  phoneTitanium: '/products/device-phone-titanium.png',
  phoneMidnight: '/products/device-phone-midnight.png',
  phoneSky: '/products/device-phone-sky.png',
  laptop: '/products/device-laptop.png',
  laptop16: '/products/device-laptop-16.png',
  tablet: '/products/device-tablet.png',
  tabletPro: '/products/device-tablet-pro.png',
  earbuds: '/products/device-earbuds.png',
  headphones: '/products/device-headphones.png',
  watch: '/products/device-watch.png',
  watchUltra: '/products/device-watch-ultra.png',
} as const;

const BANNER = {
  hero: '/products/banner-hero.png',
  tradein: '/products/banner-tradein.png',
  installment: '/products/banner-installment.png',
  delivery: '/products/banner-delivery.png',
  warranty: '/products/banner-warranty.png',
} as const;

const FINANCING = 'Рассрочка 0% на 3–12 месяцев';

interface SeedProduct {
  sku: string;
  name: string;
  price: number;
  cost: number;
  category: string;
  image: string;
  brand: string;
  desc: string;
  specs: Record<string, string>;
}

const CATALOGUE: SeedProduct[] = [
  // Смартфоны
  { sku: 'IPH-15-128', name: 'iPhone 15 128GB', price: 109900, cost: 92000, category: 'Смартфоны', image: IMG.phone, brand: 'Apple',
    desc: 'iPhone 15 с чипом A16 Bionic, портом USB-C и камерой 48 Мп. Проверен по IMEI, гарантия магазина.',
    specs: { 'Экран': '6.1" OLED Super Retina XDR', 'Чип': 'A16 Bionic', 'Память': '128 ГБ', 'Камера': '48 Мп основная', 'Цвет': 'Чёрный', 'Аккумулятор': 'до 20 ч видео' } },
  { sku: 'IPH-15PRO-256', name: 'iPhone 15 Pro 256GB', price: 149900, cost: 128000, category: 'Смартфоны', image: IMG.phoneTitanium, brand: 'Apple',
    desc: 'Титановый iPhone 15 Pro с A17 Pro, ProMotion 120 Гц и трёхкамерной системой. Топ для игр и съёмки.',
    specs: { 'Экран': '6.1" OLED ProMotion 120 Гц', 'Чип': 'A17 Pro', 'Память': '256 ГБ', 'Камера': '48 + 12 + 12 Мп', 'Цвет': 'Титан натуральный', 'Корпус': 'Титан' } },
  { sku: 'IPH-14-128', name: 'iPhone 14 128GB', price: 84900, cost: 71000, category: 'Смартфоны', image: IMG.phoneMidnight, brand: 'Apple',
    desc: 'Надёжный iPhone 14 с чипом A15 Bionic и отличной камерой. Выгодная цена, гарантия и проверка.',
    specs: { 'Экран': '6.1" OLED Super Retina XDR', 'Чип': 'A15 Bionic', 'Память': '128 ГБ', 'Камера': '12 Мп двойная', 'Цвет': 'Тёмная ночь', 'Аккумулятор': 'до 20 ч видео' } },
  { sku: 'SGS-24-256', name: 'Samsung Galaxy S24 256GB', price: 99900, cost: 82000, category: 'Смартфоны', image: IMG.phone, brand: 'Samsung',
    desc: 'Galaxy S24 с Snapdragon 8 Gen 3, ярким AMOLED и Galaxy AI. Компактный флагман.',
    specs: { 'Экран': '6.2" Dynamic AMOLED 2X 120 Гц', 'Процессор': 'Snapdragon 8 Gen 3', 'Память': '256 ГБ', 'Камера': '50 Мп основная', 'Цвет': 'Оникс чёрный', 'Аккумулятор': '4000 мА·ч' } },
  { sku: 'SGS-24U-512', name: 'Samsung Galaxy S24 Ultra 512GB', price: 164900, cost: 139000, category: 'Смартфоны', image: IMG.phoneTitanium, brand: 'Samsung',
    desc: 'Galaxy S24 Ultra с камерой 200 Мп, пером S Pen и титановым корпусом. Максимум возможностей.',
    specs: { 'Экран': '6.8" Dynamic AMOLED 2X 120 Гц', 'Процессор': 'Snapdragon 8 Gen 3', 'Память': '512 ГБ', 'Камера': '200 Мп + телефото', 'Стилус': 'S Pen в комплекте', 'Корпус': 'Титан' } },
  { sku: 'SGA-55-128', name: 'Samsung Galaxy A55 128GB', price: 42900, cost: 34000, category: 'Смартфоны', image: IMG.phoneSky, brand: 'Samsung',
    desc: 'Galaxy A55 — стильный средний класс с AMOLED 120 Гц и надёжной батареей.',
    specs: { 'Экран': '6.6" Super AMOLED 120 Гц', 'Процессор': 'Exynos 1480', 'Память': '128 ГБ', 'Камера': '50 Мп основная', 'Цвет': 'Айсблю', 'Аккумулятор': '5000 мА·ч' } },
  // Ноутбуки
  { sku: 'MBP-14-M3', name: 'MacBook Pro 14" M3', price: 189900, cost: 165000, category: 'Ноутбуки', image: IMG.laptop, brand: 'Apple',
    desc: 'MacBook Pro 14" на чипе M3 с дисплеем Liquid Retina XDR. Тихий, мощный, автономный.',
    specs: { 'Экран': '14.2" Liquid Retina XDR', 'Чип': 'Apple M3', 'Оперативная память': '8 ГБ', 'Накопитель': '512 ГБ SSD', 'Автономность': 'до 22 ч', 'Цвет': 'Серый космос' } },
  { sku: 'MBA-13-M3', name: 'MacBook Air 13" M3', price: 134900, cost: 116000, category: 'Ноутбуки', image: IMG.laptop, brand: 'Apple',
    desc: 'Тонкий и лёгкий MacBook Air 13" на M3 — идеален для учёбы и работы в дороге.',
    specs: { 'Экран': '13.6" Liquid Retina', 'Чип': 'Apple M3', 'Оперативная память': '8 ГБ', 'Накопитель': '256 ГБ SSD', 'Автономность': 'до 18 ч', 'Вес': '1.24 кг' } },
  { sku: 'MBP-16-M3P', name: 'MacBook Pro 16" M3 Pro', price: 279900, cost: 244000, category: 'Ноутбуки', image: IMG.laptop16, brand: 'Apple',
    desc: 'MacBook Pro 16" на M3 Pro — рабочая станция для монтажа, 3D и разработки.',
    specs: { 'Экран': '16.2" Liquid Retina XDR', 'Чип': 'Apple M3 Pro', 'Оперативная память': '18 ГБ', 'Накопитель': '512 ГБ SSD', 'Автономность': 'до 22 ч', 'Цвет': 'Чёрный космос' } },
  // Планшеты
  { sku: 'IPAD-A-11', name: 'iPad Air 11" M2', price: 74900, cost: 62000, category: 'Планшеты', image: IMG.tablet, brand: 'Apple',
    desc: 'iPad Air 11" на чипе M2 — мощь для творчества и Apple Pencil Pro.',
    specs: { 'Экран': '11" Liquid Retina', 'Чип': 'Apple M2', 'Память': '128 ГБ', 'Связь': 'Wi-Fi 6E', 'Перо': 'Apple Pencil Pro', 'Цвет': 'Серый космос' } },
  { sku: 'IPAD-P-11', name: 'iPad Pro 11" M4', price: 119900, cost: 101000, category: 'Планшеты', image: IMG.tabletPro, brand: 'Apple',
    desc: 'iPad Pro 11" с дисплеем Ultra Retina XDR (OLED) и чипом M4. Самый тонкий iPad.',
    specs: { 'Экран': '11" Ultra Retina XDR (OLED)', 'Чип': 'Apple M4', 'Память': '256 ГБ', 'Связь': 'Wi-Fi 6E', 'Перо': 'Apple Pencil Pro', 'Цвет': 'Серебристый' } },
  { sku: 'IPAD-10', name: 'iPad 10.9" 64GB', price: 46900, cost: 38000, category: 'Планшеты', image: IMG.tablet, brand: 'Apple',
    desc: 'iPad 10.9" — универсальный планшет для дома, учёбы и развлечений.',
    specs: { 'Экран': '10.9" Liquid Retina', 'Чип': 'Apple A14 Bionic', 'Память': '64 ГБ', 'Связь': 'Wi-Fi', 'Цвет': 'Синий' } },
  // Аудио
  { sku: 'APP-2', name: 'AirPods Pro 2', price: 22900, cost: 17000, category: 'Аудио', image: IMG.earbuds, brand: 'Apple',
    desc: 'AirPods Pro 2 с активным шумоподавлением, адаптивным звуком и USB-C.',
    specs: { 'Тип': 'Внутриканальные TWS', 'Шумоподавление': 'Активное (ANC)', 'Чип': 'Apple H2', 'Кейс': 'USB-C, MagSafe', 'Автономность': 'до 6 ч (30 ч с кейсом)' } },
  { sku: 'APP-3', name: 'AirPods 3', price: 16900, cost: 12500, category: 'Аудио', image: IMG.earbuds, brand: 'Apple',
    desc: 'AirPods 3 с пространственным звуком и влагозащитой. Комфорт на весь день.',
    specs: { 'Тип': 'Вкладыши TWS', 'Звук': 'Пространственный', 'Защита': 'IPX4', 'Автономность': 'до 6 ч (30 ч с кейсом)' } },
  { sku: 'APP-MAX', name: 'AirPods Max', price: 62900, cost: 52000, category: 'Аудио', image: IMG.headphones, brand: 'Apple',
    desc: 'AirPods Max — полноразмерные наушники с ANC и звуком студийного уровня.',
    specs: { 'Тип': 'Полноразмерные (Over-ear)', 'Шумоподавление': 'Активное (ANC)', 'Звук': 'Пространственный', 'Автономность': 'до 20 ч', 'Цвет': 'Тёмная ночь' } },
  // Часы
  { sku: 'AW-9-45', name: 'Apple Watch Series 9 45mm', price: 41900, cost: 34000, category: 'Часы', image: IMG.watch, brand: 'Apple',
    desc: 'Apple Watch Series 9 с ярким дисплеем, датчиками здоровья и жестом Double Tap.',
    specs: { 'Корпус': '45 мм алюминий', 'Экран': 'Retina LTPO OLED', 'Чип': 'S9 SiP', 'Связь': 'GPS', 'Автономность': 'до 18 ч', 'Защита': 'WR50 / IP6X' } },
  { sku: 'AW-U2', name: 'Apple Watch Ultra 2', price: 84900, cost: 71000, category: 'Часы', image: IMG.watchUltra, brand: 'Apple',
    desc: 'Apple Watch Ultra 2 — титановый корпус, до 36 ч автономности, GPS + Cellular.',
    specs: { 'Корпус': '49 мм титан', 'Экран': 'Retina LTPO OLED', 'Связь': 'GPS + Cellular', 'Автономность': 'до 36 ч', 'Защита': 'WR100 / EN13319' } },
  { sku: 'AW-SE-44', name: 'Apple Watch SE 44mm', price: 27900, cost: 21000, category: 'Часы', image: IMG.watch, brand: 'Apple',
    desc: 'Apple Watch SE — все главные функции здоровья и безопасности по доступной цене.',
    specs: { 'Корпус': '44 мм алюминий', 'Экран': 'Retina OLED', 'Чип': 'S8 SiP', 'Связь': 'GPS', 'Автономность': 'до 18 ч' } },
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
    const attrs = { imageUrl: p.image, description: p.desc, financingText: FINANCING, 'Бренд': p.brand, ...p.specs };
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: { price: p.price, cost: p.cost, name: p.name, category: p.category, attrs },
      create: { sku: p.sku, name: p.name, price: p.price, cost: p.cost, category: p.category, attrs },
    });

    for (let n = 1; n <= 2; n += 1) {
      const imei = `${p.sku}-UNIT-${n}`;
      await prisma.deviceUnit.upsert({
        where: { imei },
        update: {},
        create: { imei, productId: product.id, status: 'in_stock', location: 'BISHKEK-1', grade: 'A' },
      });
    }
  }

  // Published storefront revision — drives the homepage hero, benefits and contacts.
  const heroContent = {
    status: 'published',
    heroEyebrow: 'Доставка 1–2 часа по Бишкеку',
    heroTitle: 'Техника Apple и Samsung — с гарантией',
    heroBody: 'Новое и Б/У привозное с проверкой по IMEI. Рассрочка 0%, trade-in старого устройства, единый профиль и корзина на сайте и в приложении.',
    heroCtaLabel: 'Открыть каталог',
    heroCtaHref: '/catalog',
    heroImageUrl: BANNER.hero,
    financingText: FINANCING,
    benefits: HERO_BENEFITS,
    featuredTitle: 'Хиты продаж',
    contactPhone: '+996 700 123 456',
    supportHours: 'Ежедневно 10:00–21:00',
    publishedBy: 'seed',
    publishedAt: new Date(),
  } as const;
  await prisma.storefrontContentRevision.upsert({
    where: { version: 1 },
    update: heroContent,
    create: {
      version: 1,
      ...heroContent,
      aboutTitle: 'О компании',
      aboutBody: 'AliStore — магазин электроники в Бишкеке: новое и привозное Б/У с гарантией, проверкой по IMEI и честной ценой.',
      deliveryTitle: 'Доставка и оплата',
      deliveryBody: 'Курьер по Бишкеку 1–2 часа, самовывоз из центра, оплата картой, наличными и в рассрочку.',
      createdBy: 'seed',
    },
  });

  // Approved reviews so every product carries real social proof (stars + count).
  const REVIEWERS = [
    { phone: '+996700200001', name: 'Азамат Т.' },
    { phone: '+996700200002', name: 'Айгуль К.' },
    { phone: '+996700200003', name: 'Данияр С.' },
    { phone: '+996700200004', name: 'Нурлан А.' },
    { phone: '+996700200005', name: 'Аида М.' },
    { phone: '+996700200006', name: 'Тимур Ж.' },
  ];
  const REVIEW_TEXT: Record<string, string[]> = {
    'Смартфоны': [
      'Телефон оригинальный, IMEI пробили при мне. Батарея спокойно держит весь день.',
      'Заказал вечером — привезли на следующее утро. Упаковка целая, всё как в описании.',
      'Оформил в рассрочку без переплаты. Камера отличная, вышло выгоднее, чем в других магазинах.',
    ],
    'Ноутбуки': [
      'Ноутбук шустрый и тихий, почти не греется. Для работы и монтажа хватает с запасом.',
      'Проверили всё при получении, гарантию оформили сразу. Претензий нет.',
      'Сборка отличная, автономности реально хватает на полный рабочий день.',
    ],
    'Планшеты': [
      'Экран сочный, для заметок и рисования то что нужно. Перо докупил отдельно.',
      'Пришёл запечатанный, активировался без проблем. Доставка быстрая.',
      'Беру здесь уже второй раз — всё честно, без скрытых доплат.',
    ],
    'Аудио': [
      'Шумоподавление работает отлично, в маршрутке музыку слушать одно удовольствие.',
      'Звук чистый, заряд держат как заявлено. Кейс удобно ложится в карман.',
      'Оригинал, проверял по серийному номеру. Привезли за пару часов.',
    ],
    'Часы': [
      'Часы супер, автономности хватает на пару дней при активном использовании.',
      'Экран яркий даже на солнце, ремешок удобный. Спасибо за быструю доставку.',
      'Брал в подарок — упаковали аккуратно, всё работает из коробки.',
    ],
  };
  const RATING_SETS = [[5, 5, 5], [5, 5, 4], [5, 4, 5], [4, 5, 5], [5, 5, 4], [5, 4, 4]];
  const reviewers = [];
  for (const r of REVIEWERS) {
    reviewers.push(
      await prisma.customer.upsert({
        where: { phone: r.phone },
        update: { name: r.name },
        create: { phone: r.phone, name: r.name, consent: true },
      }),
    );
  }
  for (const [index, p] of CATALOGUE.entries()) {
    const product = await prisma.product.findUnique({ where: { sku: p.sku } });
    if (!product) continue;
    const texts = REVIEW_TEXT[p.category] ?? [];
    const ratings = RATING_SETS[index % RATING_SETS.length];
    for (let n = 0; n < ratings.length; n += 1) {
      const reviewer = reviewers[(index + n) % reviewers.length];
      const orderId = `seed-order-${p.sku}-${n}`;
      const review = {
        status: 'approved',
        rating: ratings[n],
        text: texts[n % Math.max(texts.length, 1)] ?? null,
        moderatedBy: 'seed',
        moderatedAt: new Date(),
      };
      await prisma.productReview.upsert({
        where: { productId_customerId_orderId: { productId: product.id, customerId: reviewer.id, orderId } },
        update: review,
        create: {
          productId: product.id,
          sku: p.sku,
          customerId: reviewer.id,
          customerName: reviewer.name ?? 'Клиент',
          orderId,
          ...review,
        },
      });
    }
  }

  // Published storefront blocks — the designed banner stack on the homepage.
  const BLOCKS = [
    { id: 'seed-block-hero', type: 'hero' as const, position: 1, tone: 'dark',
      eyebrow: 'Доставка 1–2 часа по Бишкеку', title: 'Техника Apple и Samsung — с гарантией',
      body: 'Новое и привозное Б/У с проверкой по IMEI. Рассрочка 0%, trade-in и единый профиль на сайте и в приложении.',
      ctaLabel: 'Открыть каталог', ctaHref: '/catalog', imageUrl: BANNER.hero },
    { id: 'seed-block-tradein', type: 'promo' as const, position: 2, tone: 'coral',
      eyebrow: 'Trade-in', title: 'Обменяйте старый смартфон на новый',
      body: 'Оценим ваше устройство онлайн за пару минут и вычтем стоимость из нового.',
      ctaLabel: 'Оценить онлайн', ctaHref: '/trade-in', imageUrl: BANNER.tradein },
    { id: 'seed-block-installment', type: 'promo' as const, position: 3, tone: 'light',
      eyebrow: 'Рассрочка', title: 'Рассрочка 0% на 3–12 месяцев',
      body: 'Без переплаты, первого взноса и скрытых комиссий — оформление прямо в корзине.',
      ctaLabel: 'Выбрать технику', ctaHref: '/catalog', imageUrl: BANNER.installment },
    { id: 'seed-block-delivery', type: 'promo' as const, position: 4, tone: 'dark',
      eyebrow: 'Доставка', title: 'Курьер за 1–2 часа или самовывоз',
      body: 'Привезём по Бишкеку в день заказа. Или заберите сами из магазина в центре.',
      ctaLabel: 'Условия доставки', ctaHref: '/delivery', imageUrl: BANNER.delivery },
  ];
  for (const b of BLOCKS) {
    const data = {
      type: b.type, status: 'published' as const, device: 'all' as const, position: b.position,
      title: b.title, eyebrow: b.eyebrow, body: b.body, ctaLabel: b.ctaLabel, ctaHref: b.ctaHref,
      imageUrl: b.imageUrl, tone: b.tone, productIds: [], publishedAt: new Date(),
      createdBy: 'seed', updatedBy: 'seed',
    };
    await prisma.storefrontBlock.upsert({ where: { id: b.id }, update: data, create: { id: b.id, ...data } });
  }

  const products = await prisma.product.count();
  const units = await prisma.deviceUnit.count();
  // eslint-disable-next-line no-console
  console.log(`Seed done: customer ${customer.phone}, ${products} products, ${units} units in stock, storefront published.`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
