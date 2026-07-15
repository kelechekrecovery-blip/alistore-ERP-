import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedProduct } from './helpers';

test('Telegram Mini App shell creates an order with channel telegram', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('TG-E2E');

  await page.goto('/tg', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('AliStore Mini')).toBeVisible();
  await expect(page.getByText(product.name)).toBeVisible();

  await page.getByRole('button', { name: 'Добавить' }).first().click();
  await page.getByRole('button', { name: /Оформить · 1 шт/ }).click();
  await page.getByPlaceholder('+996700900007').fill('+996700900007');
  await page.getByPlaceholder('Имя в Telegram').fill('Telegram Buyer');
  await page.getByRole('button', { name: /Подтвердить · AliStore Центр/ }).click();
  await expect(page.getByText('Заказ в Telegram оформлен')).toBeVisible();
  await expect(page.getByText('channel=telegram')).toBeVisible();

  const order = await prisma.order.findFirst({
    where: { channel: 'telegram' },
    include: { items: true, customer: true },
    orderBy: { createdAt: 'desc' },
  });
  expect(order).toMatchObject({
    channel: 'telegram',
    status: 'created',
    total: product.price,
    storePointId: 'alistore-bishkek-1',
    fulfillmentLocation: 'BISHKEK-1',
  });
  expect(order?.customer.phone).toBe('+996700900007');
  expect(order?.items).toHaveLength(1);
  expect(order?.items[0]).toMatchObject({ sku: product.sku, qty: 1, price: product.price });
});
