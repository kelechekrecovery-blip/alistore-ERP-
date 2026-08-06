import { expect, test, type Page } from '@playwright/test';
import { prisma, resetDb, seedProduct } from './helpers';

async function seedCheckoutCart(page: Page, skuPrefix: string) {
  const { product } = await seedProduct(skuPrefix);
  await page.addInitScript((item) => {
    localStorage.setItem('alistore.cart.v1', JSON.stringify([{ ...item, qty: 1 }]));
    localStorage.removeItem('alistore.cart.pricing.v1');
  }, { id: product.id, sku: product.sku, name: product.name, price: product.price });
  return product;
}

async function reachPayment(page: Page, phone: string) {
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Далее' }).last().click();
  await page.getByPlaceholder('+996 700 12 34 56').fill(phone);
  await page.getByPlaceholder('Имя').fill('Reliability Buyer');
  await page.getByRole('button', { name: 'Далее' }).last().click();
}

async function submitCashOrder(page: Page) {
  const cash = page.getByRole('button', { name: /Наличными при получении/ });
  await expect(cash).toBeVisible();
  await expect(cash).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'К подтверждению' }).click();
  await expect(page.getByText('Наличными при получении')).toBeVisible();
  await page.getByLabel(/Согласен с условиями/).check();
  await page.getByRole('button', { name: /Подтвердить заказ/ }).click();
}

test('payment discovery rejection reconciles stale card to cash before display and submit', async ({ page }) => {
  await resetDb();
  await seedCheckoutCart(page, 'PAYMENT-DISCOVERY-REJECT');
  await page.route('**/payments/methods', (route) => route.abort('failed'));

  await reachPayment(page, '+996700901101');
  await expect(page.getByRole('button', { name: /Картой/ })).toHaveCount(0);
  await submitCashOrder(page);
  await expect(page.getByText('Заказ оформлен!')).toBeVisible();

  const order = await prisma.order.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
  expect(order.paymentMode).toBe('cod');
  expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
});

test('payment discovery timeout falls back to cash instead of submitting the initial card', async ({ page }) => {
  await resetDb();
  await seedCheckoutCart(page, 'PAYMENT-DISCOVERY-TIMEOUT');
  await page.route('**/payments/methods', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    await route.fulfill({ json: { online: true, methods: ['cash', 'card'] } });
  });

  await reachPayment(page, '+996700901102');
  await expect(page.getByRole('button', { name: /Наличными при получении/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /Картой/ })).toHaveCount(0);
});

test('guest order remains visible when capability persistence throws after createOrder', async ({ page }) => {
  await resetDb();
  await seedCheckoutCart(page, 'GUEST-STORAGE-FAILURE');
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === 'alistore.guest-order-access.v1') {
        throw new DOMException('storage blocked', 'SecurityError');
      }
      return originalSetItem.call(this, key, value);
    };
  });

  await reachPayment(page, '+996700901103');
  await page.getByRole('button', { name: /Наличными при получении/ }).click();
  await submitCashOrder(page);
  await expect(page.getByText('Заказ оформлен!')).toBeVisible();

  const order = await prisma.order.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
  const statusLink = page.getByRole('link', { name: 'Статус и чек' });
  await expect(statusLink).toHaveAttribute('href', new RegExp(`/order/${order.id}#access=`));
  await statusLink.click();
  await expect(page.getByText('Защищённый гостевой доступ')).toBeVisible();
  expect(new URL(page.url()).hash).toMatch(/^#access=./);
  await page.reload();
  await expect(page.getByText('Защищённый гостевой доступ')).toBeVisible();
});
