import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Minimal dev seed: one customer, a small catalogue, a few IMEI units in stock. */
const CATALOGUE = [
  { sku: 'IPH-15-128', name: 'iPhone 15 128GB', price: 109900, cost: 92000, category: 'Смартфоны' },
  { sku: 'MBP-14-M3', name: 'MacBook Pro 14" M3', price: 189900, cost: 165000, category: 'Ноутбуки' },
  { sku: 'APP-2', name: 'AirPods Pro 2', price: 22900, cost: 17000, category: 'Аудио' },
  { sku: 'AW-9-45', name: 'Apple Watch S9 45mm', price: 41900, cost: 34000, category: 'Часы' },
  { sku: 'SGS-24-256', name: 'Samsung Galaxy S24 256GB', price: 99900, cost: 82000, category: 'Смартфоны' },
  { sku: 'IPAD-A-11', name: 'iPad Air 11" M2', price: 74900, cost: 62000, category: 'Планшеты' },
];

async function main(): Promise<void> {
  const customer = await prisma.customer.upsert({
    where: { phone: '+996700123456' },
    update: {},
    create: { phone: '+996700123456', name: 'Демо Клиент', consent: true },
  });

  for (const p of CATALOGUE) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: { price: p.price, cost: p.cost, name: p.name, category: p.category },
      create: { ...p, attrs: {} },
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

  const products = await prisma.product.count();
  const units = await prisma.deviceUnit.count();
  // eslint-disable-next-line no-console
  console.log(
    `Seed done: customer ${customer.phone}, ${products} products, ${units} units in stock.`,
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
