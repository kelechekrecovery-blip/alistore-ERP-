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
  await page.getByRole('button', { name: 'Тексты и подборка' }).click();

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

test('marketer composes and reorders published storefront blocks without a code release', async ({ page }) => {
  await resetDb();
  const { username, password } = await seedStaffCredentials('marketer', 'e2e-blocks');
  const { product } = await seedProduct('Block Collection Phone', 132_000, 101_000);

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/erp');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: /CMS витрины/ }).click();
  await expect(page.getByRole('heading', { name: 'Баннеры, подборки и порядок' })).toBeVisible();

  await page.getByLabel('Устройства').selectOption('desktop');
  await page.getByLabel('Заголовок').fill('Сервис и доставка AliStore');
  await page.getByLabel('Описание').fill('Условия подтверждаются при оформлении');
  await page.getByRole('button', { name: 'Создать черновик' }).click();
  await expect(page.getByText('Черновик блока создан')).toBeVisible();
  await page.getByRole('button', { name: 'Включить' }).click();
  await expect(page.getByText('Блок опубликован')).toBeVisible();

  await page.getByLabel('Тип').selectOption('collection');
  await page.getByLabel('Устройства').selectOption('desktop');
  await page.getByLabel('Заголовок').fill('Выбор недели');
  await page.getByRole('button', { name: new RegExp(product.name) }).click();
  await page.getByRole('button', { name: 'Создать черновик' }).click();
  await page.getByRole('button', { name: 'Включить' }).click();
  await expect(page.getByText('Блок опубликован')).toBeVisible();
  const collectionRow = page.getByRole('article').filter({ hasText: 'Выбор недели' });
  await collectionRow.getByTitle('Выше').click();
  await expect(page.getByText('Порядок блоков обновлён')).toBeVisible();

  await page.getByLabel('Тип').selectOption('hero');
  await page.getByLabel('Устройства').selectOption('mobile');
  await page.getByLabel('Заголовок').fill('Мобильная акция AliStore');
  await page.getByLabel('Описание').fill('Этот баннер виден только на телефоне');
  await page.getByRole('button', { name: 'Создать черновик' }).click();
  await page.getByRole('button', { name: 'Включить' }).click();
  await expect(page.getByText('Блок опубликован')).toBeVisible();

  await page.goto('/');
  const blocks = page.locator('[data-testid="managed-storefront-blocks"] > [data-storefront-block]');
  await expect(blocks).toHaveCount(2);
  await expect(blocks.nth(0)).toContainText('Выбор недели');
  await expect(blocks.nth(0)).toContainText(product.name);
  await expect(blocks.nth(1)).toContainText('Сервис и доставка AliStore');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto('/');
  await expect(page.getByText('Мобильная акция AliStore')).toBeVisible();
  await expect(page.getByText('Сервис и доставка AliStore')).toBeHidden();
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

test('marketer launches a promotion in ERP and checkout redeems the same server quote', async ({ page }) => {
  await resetDb();
  const { username, password } = await seedStaffCredentials('marketer', 'e2e-promo');
  const { product } = await seedProduct('Managed Promo', 100_000, 80_000);
  const code = `LIVE${Date.now().toString().slice(-6)}`;
  await page.addInitScript((item) => {
    localStorage.setItem('alistore.cart.v1', JSON.stringify([{ ...item, qty: 1, stockLimit: 1 }]));
    localStorage.removeItem('alistore.cart.pricing.v1');
  }, { id: product.id, sku: product.sku, name: product.name, price: product.price });

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/erp');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: /CMS витрины/ }).click();
  await page.getByRole('button', { name: 'Промокоды' }).click();
  await page.getByLabel('Код').fill(code);
  await page.getByLabel('Название').fill('Живая акция AliStore');
  await page.getByLabel('Скидка, сом').fill('3000');
  await page.getByLabel('Общий лимит').fill('5');
  await page.getByLabel('На одного клиента').fill('1');
  await page.getByRole('button', { name: 'Создать черновик' }).click();
  await expect(page.getByText('Черновик промокода создан. Активируйте его после проверки условий.')).toBeVisible();
  await page.getByRole('button', { name: 'Активировать' }).first().click();
  await expect(page.getByText(`${code} доступен в корзине`)).toBeVisible();

  await page.goto('/cart');
  await page.getByPlaceholder('Введите промокод').fill(code);
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByText(new RegExp(`${code} применён`))).toBeVisible();
  await expect(page.getByText(/скидка 3\s?000 с/)).toBeVisible();
  await page.getByRole('link', { name: 'Перейти к оформлению' }).click();
  await page.getByRole('button', { name: 'Далее' }).last().click();
  await page.getByPlaceholder('+996 700 12 34 56').fill(`+996700${Date.now().toString().slice(-6)}`);
  await page.getByPlaceholder('Имя').fill('Promo Buyer');
  await page.getByRole('button', { name: 'Далее' }).last().click();
  await page.getByRole('button', { name: 'К подтверждению' }).click();
  await page.getByRole('button', { name: /Подтвердить заказ/ }).click();
  await expect(page.getByText('Заказ оформлен!')).toBeVisible();

  const order = await prisma.order.findFirstOrThrow({ where: { promoCode: code }, orderBy: { createdAt: 'desc' } });
  expect(order).toMatchObject({ subtotal: 100_000, promoDiscount: 3000, total: 97_000 });
  expect(await prisma.promotionRedemption.count({ where: { orderId: order.id } })).toBe(1);
  expect(await prisma.auditEvent.count({ where: { type: 'promotion.redeemed', refs: { has: order.id } } })).toBe(1);
});
