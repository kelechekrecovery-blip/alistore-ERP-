import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedProduct } from './helpers';

test('catalog to cart to checkout keeps guest flow healthy', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('GUEST-NAV-E2E');
  const errors: string[] = [];
  const chunkFailures: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/_next/static/') && response.status() >= 400) chunkFailures.push(response.url());
  });

  await page.goto(`/product/${product.id}`);
  await expect(page.getByRole('heading', { name: product.name })).toBeVisible();
  await page.getByRole('button', { name: 'В корзину' }).click();
  await page.goto('/cart');
  await page.getByRole('link', { name: 'Перейти к оформлению' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText('Способ получения')).toBeVisible();
  expect(chunkFailures).toEqual([]);
  expect(errors.filter((message) => /ChunkLoadError|MIME/i.test(message))).toEqual([]);
  expect(await prisma.product.count({ where: { id: product.id } })).toBe(1);
});
