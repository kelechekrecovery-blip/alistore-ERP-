import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedProduct } from './helpers';

/**
 * Срез 1 (docs/SUPPLY-TO-ORDER-PLAN.md, задача 1.4): витрина обязана говорить
 * правду про срок поставки. Товар «под заказ» показывает реальный срок в днях,
 * товар своего стока продолжает вести себя ровно так же, как сегодня.
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

test('catalog cards and product pages show the real supply lead time, both desktop and mobile', async ({ page }) => {
  await resetDb();
  const { product: stocked } = await seedProduct('SUPPLY-STOCK', 50000, 40000);
  const toOrder = await seedToOrderProduct('SUPPLY-TOORDER', 3);

  // Desktop catalog grid.
  //
  // Скоуп обязателен по той же причине, что и у карточек товара ниже: `/catalog`
  // держит обе вёрстки в DOM одновременно (`CatalogClient.tsx:63-64` —
  // `md:hidden` мобильная и `hidden md:block` десктопная), мобильная лишь скрыта
  // CSS. Без скоупа ассерт «Под заказ · 3 дня» проходил только пока мобильная
  // сетка не успевала отрисовать товары: как только она стала догружаться
  // вовремя, тот же текст нашёлся дважды и strict mode уронил проверку. Ловил
  // он при этом не дефект витрины, а гонку — обе метки верны и обе нужны.
  await page.goto('/catalog');
  await expect(page.locator('.md\\:block').getByText('В наличии · 1 шт.')).toBeVisible();
  await expect(page.locator('.md\\:block').getByText('Под заказ · 3 дня')).toBeVisible();

  // Desktop product detail pages (both mirrors are in the DOM at once — the
  // `md:hidden` mobile tree is only CSS-hidden — so scope to the desktop one).
  await page.goto(`/product/${stocked.id}`);
  await expect(page.locator('.md\\:block').getByText('В наличии · 1 шт.')).toBeVisible();
  await page.goto(`/product/${toOrder.id}`);
  await expect(page.locator('.md\\:block').getByText('Под заказ · 3 дня')).toBeVisible();

  // Mobile mirrors.
  await page.setViewportSize({ width: 402, height: 858 });
  await page.goto('/catalog');
  await expect(page.locator('.md\\:hidden').getByText('1 в наличии')).toBeVisible();
  await expect(page.locator('.md\\:hidden').getByText('Под заказ · 3 дня')).toBeVisible();

  await page.goto(`/product/${stocked.id}`);
  await expect(page.locator('.md\\:hidden').getByText('1 шт')).toBeVisible();
  await page.goto(`/product/${toOrder.id}`);
  await expect(page.locator('.md\\:hidden').getByText('Под заказ · 3 дня')).toBeVisible();
});
