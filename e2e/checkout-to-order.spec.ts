import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedProduct } from './helpers';

/**
 * Срез 2 (docs/SUPPLY-TO-ORDER-PLAN.md): товар «под заказ» становится
 * покупаемым — честно, как заявка, а не оплаченная покупка. Сервер уже
 * пропускает стоковый гейт для `supplyMode='to_order'` и создаёт заказ в
 * статусе `awaiting_confirmation`; здесь проверяется веб-половина — добавление
 * в корзину, честный чек-аут без попытки оплаты и explicit UX для смешанной
 * корзины (сервер отвечает `mixed_supply_mode_order`, если такую корзину
 * всё же отправить).
 */
async function seedToOrderProduct(prefix: string, supplyLeadDays: number, price = 90000) {
  const suffix = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  return prisma.product.create({
    data: {
      sku: suffix,
      name: `${prefix} iPhone`,
      price,
      cost: 70000,
      category: 'phones',
      attrs: {},
      supplyMode: 'to_order',
      supplyLeadDays,
    },
  });
}

test('a to-order product can be requested through checkout as an unpaid, honestly-labelled request', async ({ page }) => {
  await resetDb();
  const toOrder = await seedToOrderProduct('TOORDER-E2E', 5);

  await page.goto(`/product/${toOrder.id}`);
  const addButton = page.locator('.md\\:block').getByTestId('pdp-add-to-cart');
  await expect(addButton).toHaveText(/Заказать/);
  await expect(addButton).toBeEnabled();
  await addButton.click();
  await expect(addButton).toHaveText(/Добавлено/);

  await page.goto('/checkout');
  await expect(page.getByText('Способ получения')).toBeVisible();
  await page.getByRole('button', { name: 'Далее' }).last().click();
  await page.getByPlaceholder('+996 700 12 34 56').fill(`+996700${Date.now().toString().slice(-6)}`);
  await page.getByPlaceholder('Имя').fill('To-Order Buyer');
  await page.getByRole('button', { name: 'Далее' }).last().click();

  // Payment step must not offer to pay now — a to-order line cannot be
  // reserved or paid yet (`to_order_not_reservable`, orders.service.ts).
  await expect(page.getByText(/заявка/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Картой/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'К подтверждению' }).click();

  await expect(page.getByText(/5 дней/)).toBeVisible();
  await page.getByLabel(/Согласен с условиями/).check();
  await page.getByRole('button', { name: /Подтвердить заказ/ }).click();

  await expect(page.getByText('Заявка принята')).toBeVisible();
  await expect(page.getByText(/5 дней/)).toBeVisible();
  await expect(page.getByText(/Оплата — только после подтверждения/)).toBeVisible();

  const order = await prisma.order.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
  expect(order.status).toBe('awaiting_confirmation');
  expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
});

test('adding a product of a different supply mode than the cart is blocked with an explanation, not silently dropped', async ({ page }) => {
  await resetDb();
  const { product: stocked } = await seedProduct('MIX-STOCK-E2E');
  const toOrder = await seedToOrderProduct('MIX-TOORDER-E2E', 7);

  await page.goto(`/product/${stocked.id}`);
  const stockedAddButton = page.locator('.md\\:block').getByTestId('pdp-add-to-cart');
  await expect(stockedAddButton).toHaveText(/В корзину/);
  await stockedAddButton.click();
  await expect(stockedAddButton).toHaveText(/Добавлено/);

  await page.goto(`/product/${toOrder.id}`);
  const blockedButton = page.locator('.md\\:block').getByTestId('pdp-add-to-cart');
  await expect(blockedButton).toHaveText(/Заказать/);
  await expect(blockedButton).toBeDisabled();
  await expect(page.locator('.md\\:block').getByText(/другой тип поставки/i)).toBeVisible();

  // The existing own-stock line must survive untouched — blocking an addition
  // must not silently drop what was already in the cart.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('alistore.cart.v1') ?? '[]'))).toHaveLength(1);
});

test('a cart mixed by stale storage is blocked at checkout, not sent to the server as a 500-looking failure', async ({ page }) => {
  await resetDb();
  const { product: stocked } = await seedProduct('MIX-STORAGE-STOCK-E2E');
  const toOrder = await seedToOrderProduct('MIX-STORAGE-TOORDER-E2E', 4);

  await page.addInitScript(({ own, toOrderItem }) => {
    localStorage.setItem(
      'alistore.cart.v1',
      JSON.stringify([
        { ...own, qty: 1, stockLimit: 1, supplyMode: 'own_stock', supplyLeadDays: null },
        { ...toOrderItem, qty: 1, stockLimit: 10, supplyMode: 'to_order', supplyLeadDays: 4 },
      ]),
    );
    localStorage.removeItem('alistore.cart.pricing.v1');
  }, {
    own: { id: stocked.id, sku: stocked.sku, name: stocked.name, price: stocked.price },
    toOrderItem: { id: toOrder.id, sku: toOrder.sku, name: toOrder.name, price: toOrder.price },
  });

  await page.goto('/checkout');
  await expect(page.getByText(/разн(ый|ым) способ(ом)? поставки/i)).toBeVisible();
  await expect(page.getByText('Способ получения')).toHaveCount(0);
  expect(await prisma.order.count()).toBe(0);
});
