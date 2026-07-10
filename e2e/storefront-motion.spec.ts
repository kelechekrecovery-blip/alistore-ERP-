import { expect, test } from '@playwright/test';
import { resetDb, seedProduct } from './helpers';

test('desktop storefront motion stays visible and respects reduced motion', async ({ page }) => {
  await resetDb();
  await seedProduct('MOTION-E2E');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Электроника, которая уже рядом.' })).toBeVisible();
  await expect(page.locator('.store-product-float')).toBeVisible();
  await expect(page.locator('article')).toHaveCount(1);

  const animated = await page.locator('.store-product-float').evaluate((element) => {
    const style = getComputedStyle(element);
    return { animationName: style.animationName, opacity: style.opacity };
  });
  expect(animated.animationName).toContain('store-product');
  expect(animated.opacity).toBe('1');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page.locator('.store-product-float').evaluate((element) => {
    const style = getComputedStyle(element);
    return { animationName: style.animationName, opacity: style.opacity, transform: style.transform };
  });
  expect(reduced).toEqual({ animationName: 'none', opacity: '1', transform: 'none' });

  await page.goto('/app');
  await expect(page.getByText('iPhone 17 Pro Max')).toBeVisible();
});
