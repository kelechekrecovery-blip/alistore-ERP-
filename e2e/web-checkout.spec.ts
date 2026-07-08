import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedProduct } from './helpers';

test('web checkout pays a cart by sandbox card', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('WEB-E2E');
  await page.addInitScript((item) => {
    localStorage.setItem('alistore.cart.v1', JSON.stringify([{ ...item, qty: 1 }]));
    localStorage.removeItem('alistore.cart.pricing.v1');
  }, { id: product.id, sku: product.sku, name: product.name, price: product.price });

  await page.goto('/checkout');
  await expect(page.getByText('Способ получения')).toBeVisible();
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
