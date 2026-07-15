import { expect, test } from '@playwright/test';
import { customerToken, postJson, prisma, resetDb, seedProduct, seedStaffCredentials } from './helpers';

test('ERP publishes an ordered product collection to the desktop storefront', async ({ page }) => {
  await resetDb();
  const { username, password } = await seedStaffCredentials('marketer', 'e2e-cms');
  const first = await seedProduct('CMS First', 115_000, 90_000);
  const second = await seedProduct('CMS Second', 125_000, 95_000);

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/erp');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: /CMS витрины/ }).click();

  await expect(page.getByRole('heading', { name: 'Контент клиентского сайта' })).toBeVisible();
  await page.getByLabel('Заголовок подборки').fill('Выбор команды AliStore');
  await page.getByPlaceholder('Поиск по названию, SKU, категории').fill('CMS');
  await expect(page.getByRole('button', { name: new RegExp(first.product.name) })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(first.product.name) }).click();
  await page.getByRole('button', { name: new RegExp(second.product.name) }).click();
  await page.getByTitle('Выше').last().click();
  await page.getByRole('button', { name: 'Сохранить черновик' }).click();
  await expect(page.getByText('Черновик сохранён')).toBeVisible();
  await page.getByRole('button', { name: 'Опубликовать сейчас' }).first().click();
  await expect(page.getByText(/Версия v\d+ опубликована/)).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Выбор команды AliStore' })).toBeVisible();
  const cards = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Выбор команды AliStore' }) }).locator('article');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText(second.product.name);
  await expect(cards.nth(1)).toContainText(first.product.name);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
});

test('customer review stays private until a marketer approves it in ERP', async ({ page, request }) => {
  await resetDb();
  const { username, password } = await seedStaffCredentials('marketer', 'e2e-review');
  const { product } = await seedProduct('Moderated Review', 98_000, 80_000);
  const phone = `+996700${Date.now().toString().slice(-6)}`;
  const token = await customerToken(request, phone);
  const customer = await prisma.customer.findUniqueOrThrow({ where: { phone } });
  await prisma.order.create({
    data: {
      customerId: customer.id,
      channel: 'web',
      total: product.price,
      status: 'paid',
      items: { create: [{ sku: product.sku, qty: 1, price: product.price }] },
    },
  });
  await postJson(request, `/products/${product.id}/reviews`, { rating: 5, text: 'Проверенный отзыв из браузерного сценария' }, token);

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/erp');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: /CMS витрины/ }).click();
  await page.getByRole('button', { name: 'Модерация отзывов' }).click();
  await expect(page.getByText('Проверенный отзыв из браузерного сценария')).toBeVisible();
  await page.getByRole('button', { name: 'Одобрить' }).click();
  await expect(page.getByText('Отзыв опубликован на карточке товара')).toBeVisible();

  await page.goto(`/product/${product.id}`);
  await expect(page.getByRole('article').filter({ hasText: 'Проверенный отзыв из браузерного сценария' })).toBeVisible();
});
