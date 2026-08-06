import { expect, test } from '@playwright/test';
import { sign } from 'jsonwebtoken';
import { prisma, resetDb, seedProduct } from './helpers';

test('customer account data is shared by API, web cabinet and checkout', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('ACCOUNT-SYNC', 10_000);
  const phone = '+996700940001';
  const customer = await prisma.customer.create({ data: { phone, name: 'E2E Account Customer' } });
  const tokens = {
    accessToken: sign(
      { sub: customer.id, phone: customer.phone, typ: 'customer' },
      'dev-secret-alistore-local',
      { expiresIn: '1h' },
    ),
    refreshToken: 'account-data-test-refresh',
  };
  await prisma.loyaltyEntry.create({
    data: { customerId: customer.id, label: 'E2E начисление', amount: 725, sourceRef: 'e2e-account-credit' },
  });
  await prisma.customerCoupon.create({
    data: { customerId: customer.id, title: 'E2E купон', code: 'SYNC725', valueLabel: '-725 с' },
  });

  await page.addInitScript(({ auth, item }) => {
    localStorage.setItem('alistore.auth.v1', JSON.stringify(auth));
    localStorage.setItem('alistore.cart.v1', JSON.stringify([
      { ...item, qty: 1 },
    ]));
    localStorage.removeItem('alistore.addresses.v1');
  }, { auth: tokens, item: { id: product.id, sku: product.sku, name: product.name, price: product.price } });

  await page.goto('/account/bonuses');
  await expect(page.getByText('725', { exact: true })).toBeVisible();
  await expect(page.getByText('SYNC725', { exact: true })).toBeVisible();
  await expect(page.getByText('E2E начисление', { exact: true })).toBeVisible();

  await page.goto('/account/addresses');
  await page.getByPlaceholder('Название: дом, работа').fill('E2E дом');
  await page.getByPlaceholder('Город, улица, дом, квартира').fill('Бишкек, улица Синхронизации 7');
  await page.getByPlaceholder('Комментарий курьеру').fill('API и сайт');
  await page.getByRole('button', { name: 'Сохранить адрес' }).click();
  await expect(page.getByText('Бишкек, улица Синхронизации 7', { exact: true })).toBeVisible();
  await expect(page.getByText('основной', { exact: true })).toBeVisible();

  const addressesLoaded = page.waitForResponse((response) =>
    response.url().includes('/customers/me/addresses') && response.status() === 200,
  );
  await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
  await addressesLoaded;
  await page.getByRole('button', { name: /Курьер/ }).click();
  await expect(page.getByRole('textbox', { name: 'Точный адрес доставки' })).toHaveValue('Бишкек, улица Синхронизации 7');

  const storedAddress = await prisma.customerAddress.findFirstOrThrow({ where: { customerId: customer.id } });
  expect(storedAddress).toMatchObject({ text: 'Бишкек, улица Синхронизации 7', isPrimary: true });
});

test('mobile account distinguishes empty orders from loyalty failure', async ({ page }) => {
  await resetDb();
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = '+996700940002';
  const customer = await prisma.customer.create({ data: { phone, name: 'Mobile empty state' } });
  const auth = {
    accessToken: sign(
      { sub: customer.id, phone: customer.phone, typ: 'customer' },
      'dev-secret-alistore-local',
      { expiresIn: '1h' },
    ),
    refreshToken: 'mobile-account-state-refresh',
  };
  await page.addInitScript((tokens) => localStorage.setItem('alistore.auth.v1', JSON.stringify(tokens)), auth);
  await page.route('**/customers/me/loyalty', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ statusCode: 503, code: 'loyalty_unavailable', message: 'temporary outage' }),
  }));

  await page.goto('/account');
  const mobileAccount = page.locator('.md\\:hidden');
  await expect(mobileAccount.getByText('Заказов пока нет', { exact: true })).toBeVisible();
  await expect(mobileAccount.getByText('Ошибка загрузки', { exact: true })).toBeVisible();
  await expect(mobileAccount.getByText('Не удалось загрузить программу лояльности', { exact: true })).toBeVisible();
  await expect(mobileAccount.getByText('Загрузка...', { exact: true })).toHaveCount(0);
});
