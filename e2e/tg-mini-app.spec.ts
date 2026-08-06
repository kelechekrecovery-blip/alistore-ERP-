import { expect, test } from '@playwright/test';
import { sign } from 'jsonwebtoken';
import { prisma, resetDb, seedProduct } from './helpers';

test('Telegram Mini App shell creates an order with channel telegram', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('TG-E2E');

  await page.goto('/tg', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('AliStore Mini')).toBeVisible();
  await expect(page.getByText(product.name)).toBeVisible();
  await expect(page.getByTestId('product-visual-fallback').first()).toBeVisible();

  await page.getByRole('button', { name: 'Добавить' }).first().click();
  await page.getByRole('button', { name: /Оформить · 1 шт/ }).click();
  await page.getByPlaceholder('+996700900007').fill('+996700900007');
  await page.getByPlaceholder('Имя в Telegram').fill('Telegram Buyer');
  const confirm = page.getByRole('button', { name: /Подтвердить · AliStore Центр/ });
  await expect(confirm).toBeDisabled();
  await page.getByRole('checkbox', { name: /публичной оферты.*обработкой персональных данных/i }).check();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText('Заказ в Telegram оформлен')).toBeVisible();
  await expect(page.getByText('channel=telegram')).toBeVisible();
  await page.getByRole('link', { name: 'Статус и чек' }).click();
  await expect(page).toHaveURL(/\/order\//);
  await expect.poll(() => new URL(page.url()).hash).toBe('');
  await expect(page.getByText('Защищённый гостевой доступ')).toBeVisible();
  await expect(page.getByText(product.sku)).toBeVisible();
  await page.reload();
  await expect(page.getByText('Защищённый гостевой доступ')).toBeVisible();

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
  expect(order?.piiConsentAt).not.toBeNull();
});

test('Telegram Mini App prefers an approved product image over the fallback', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('TG-IMAGE-E2E');
  await prisma.product.update({
    where: { id: product.id },
    data: { attrs: { imageUrl: '/icon.svg' } },
  });

  await page.goto('/tg', { waitUntil: 'domcontentloaded' });
  const card = page.locator('article').filter({ hasText: product.name });
  await expect(card.getByRole('img', { name: product.name })).toBeVisible();
  await expect(card.getByTestId('product-visual-fallback')).toHaveCount(0);
});

test('authenticated Telegram checkout records consent on the customer order', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('TG-AUTH-E2E');
  const customer = await prisma.customer.create({
    data: { phone: '+996700900008', name: 'Telegram authenticated buyer' },
  });
  const auth = {
    accessToken: sign(
      { sub: customer.id, phone: customer.phone, typ: 'customer' },
      'dev-secret-alistore-local',
      { expiresIn: '1h' },
    ),
    refreshToken: 'telegram-auth-checkout-refresh',
  };
  await page.addInitScript((tokens) => localStorage.setItem('alistore.auth.v1', JSON.stringify(tokens)), auth);

  await page.goto('/tg', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(product.name)).toBeVisible();
  await page.getByRole('button', { name: 'Добавить' }).first().click();
  await page.getByRole('button', { name: /Оформить · 1 шт/ }).click();
  await expect(page.getByPlaceholder('+996700900007')).toHaveValue(customer.phone);
  await page.getByRole('checkbox', { name: /публичной оферты.*обработкой персональных данных/i }).check();
  await page.getByRole('button', { name: /Подтвердить · AliStore Центр/ }).click();
  await expect(page.getByText('Заказ в Telegram оформлен')).toBeVisible();

  const order = await prisma.order.findFirstOrThrow({ where: { channel: 'telegram' } });
  expect(order).toMatchObject({ customerId: customer.id, channel: 'telegram' });
  expect(order.piiConsentAt).not.toBeNull();
});
