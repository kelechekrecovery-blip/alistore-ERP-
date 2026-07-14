import { expect, test } from '@playwright/test';
import { sign } from 'jsonwebtoken';
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
  expect(await page.locator('.md\\:block').first().evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(245, 245, 247)');

  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Корзина', exact: true })).toBeVisible();
  expect(await page.locator('.md\\:block').first().evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(245, 245, 247)');

  await page.goto('/checkout');
  await expect(page.getByText('Способ получения')).toBeVisible();
  expect(await page.locator('.checkout-shell').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(245, 245, 247)');
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

test('product page switches between independently stocked variants', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('VARIANT-BLACK', 100000);
  await prisma.product.update({
    where: { id: product.id },
    data: { variantGroup: 'iphone-variant-e2e', attrs: { color: 'Black', storage: '128GB' } },
  });
  const sibling = await prisma.product.create({
    data: {
      sku: `VARIANT-BLUE-${Date.now()}`,
      barcode: `BAR-${Date.now()}`,
      variantGroup: 'iphone-variant-e2e',
      name: 'Variant Blue iPhone',
      price: 110000,
      cost: 85000,
      category: 'phones',
      attrs: { color: 'Blue', storage: '256GB' },
    },
  });
  await prisma.deviceUnit.create({
    data: { imei: `VARIANT-BLUE-${Date.now()}-IMEI`, productId: sibling.id, status: 'in_stock', location: 'BISHKEK-1' },
  });

  await page.goto(`/product/${product.id}`);
  const variantLink = page.getByRole('link', { name: /Blue · 256GB/ }).first();
  await expect(variantLink).toBeVisible();
  await variantLink.click();
  await expect(page.getByRole('heading', { name: sibling.name })).toBeVisible();

  await page.setViewportSize({ width: 402, height: 858 });
  await page.goto(`/product/${product.id}`);
  await expect(page.getByRole('link', { name: /Blue · 256GB/ }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(402);
});

test('authenticated checkout redeems server loyalty and canonical promo exactly once', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('LOYALTY-E2E');
  const customer = await prisma.customer.create({ data: { phone: '+996700900725', name: 'Loyalty Buyer' } });
  await prisma.loyaltyEntry.create({
    data: { customerId: customer.id, label: 'E2E balance', amount: 725, sourceRef: 'loyalty-e2e-seed' },
  });
  const tokens = {
    accessToken: sign(
      { sub: customer.id, phone: customer.phone, typ: 'customer' },
      'dev-secret-alistore-local',
      { expiresIn: '1h' },
    ),
    refreshToken: 'loyalty-e2e-refresh',
  };
  await page.addInitScript(({ auth, item }) => {
    localStorage.setItem('alistore.auth.v1', JSON.stringify(auth));
    localStorage.setItem('alistore.cart.v1', JSON.stringify([{ ...item, qty: 1 }]));
    localStorage.removeItem('alistore.cart.pricing.v1');
  }, { auth: tokens, item: { id: product.id, sku: product.sku, name: product.name, price: product.price } });

  await page.goto('/cart');
  await page.getByPlaceholder('Введите промокод').fill('ALI10');
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByText(/Списать до 725 бонусов/)).toBeVisible();
  await page.getByRole('button', { name: /Списать до 725 бонусов/ }).click();
  await expect(page.locator('span:visible').filter({ hasText: '−725 с' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Перейти к оформлению' }).click();
  await page.getByRole('button', { name: 'Далее' }).last().click();
  await expect(page.getByPlaceholder('+996 700 12 34 56')).toHaveValue(customer.phone);
  await page.getByRole('button', { name: 'Далее' }).last().click();
  await page.getByRole('button', { name: /Картой/ }).click();
  await page.getByRole('button', { name: 'К подтверждению' }).click();
  await page.getByRole('button', { name: /Подтвердить заказ/ }).click();
  await expect(page.getByText('Ожидаем оплату')).toBeVisible();
  await page.getByRole('button', { name: /Подтвердить sandbox/ }).click();
  await expect(page.getByText('Заказ оформлен!')).toBeVisible();

  const order = await prisma.order.findFirstOrThrow({ where: { customerId: customer.id }, orderBy: { createdAt: 'desc' } });
  expect(order).toMatchObject({
    subtotal: product.price,
    promoCode: 'ALI10',
    promoDiscount: 3000,
    loyaltyRedeemed: 725,
    total: product.price - 3725,
    status: 'paid',
  });
  expect(await prisma.loyaltyEntry.count({ where: { orderId: order.id, kind: 'redeem', amount: -725 } })).toBe(1);
  expect(await prisma.auditEvent.count({ where: { type: 'loyalty.redeemed', refs: { has: order.id } } })).toBe(1);
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
