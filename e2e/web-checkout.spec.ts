import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedProduct } from './helpers';

test('web checkout pays a cart by sandbox card', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('WEB-E2E');
  await page.addInitScript((item) => {
    localStorage.setItem('alistore.cart.v1', JSON.stringify([{ ...item, qty: 1 }]));
    localStorage.removeItem('alistore.cart.pricing.v1');
  }, { id: product.id, sku: product.sku, name: product.name, price: product.price });

  await page.goto(`/product/${product.id}`);
  await expect(page.getByRole('heading', { name: product.name })).toBeVisible();
  expect(await page.locator('.md\\:block').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(247, 242, 236)');

  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Корзина', exact: true })).toBeVisible();
  expect(await page.locator('.md\\:block').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(247, 242, 236)');

  await page.goto('/checkout');
  await expect(page.getByText('Способ получения')).toBeVisible();
  expect(await page.locator('.checkout-shell').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(247, 242, 236)');
  expect(await page.locator('.checkout-panel').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.getByRole('button', { name: 'Далее' }).last().click();
  await page.getByPlaceholder('+996 700 12 34 56').fill('+996700900001');
  await page.getByPlaceholder('Имя').fill('E2E Buyer');
  await page.getByRole('button', { name: 'Далее' }).last().click();
  await page.getByRole('button', { name: /Картой/ }).click();
  await page.getByRole('button', { name: 'К подтверждению' }).click();
  await page.getByRole('button', { name: /Подтвердить заказ/ }).click();
  await expect(page.getByText('Ожидаем оплату')).toBeVisible();
  await page.getByRole('button', { name: /Подтвердить sandbox/ }).click();
  await expect(page.getByText('Заказ оформлен!')).toBeVisible();

  const order = await prisma.order.findFirst({ orderBy: { createdAt: 'desc' } });
  expect(order).toMatchObject({
    status: 'paid',
    fulfillmentType: 'pickup',
    pickupPoint: 'alistore-center',
  });
  expect(order?.pickupCode).toMatch(/^PU-/);
  expect(await prisma.payment.count({ where: { orderId: order?.id, method: 'card' } })).toBe(1);
});

test('phone checkout preserves the dark Client App handoff theme', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 858 });
  await page.addInitScript(() => {
    localStorage.setItem('alistore.cart.v1', JSON.stringify([{ id: 'mobile-checkout', sku: 'MOBILE-CHECKOUT', name: 'iPhone', price: 109900, qty: 1 }]));
  });

  await page.goto('/checkout');
  await expect(page.getByText('Способ получения')).toBeVisible();
  expect(await page.locator('.checkout-shell').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(12, 12, 23)');
  expect(await page.locator('.checkout-panel').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(17, 17, 32)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(402);
});
