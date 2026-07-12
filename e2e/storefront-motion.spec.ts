import { expect, test } from '@playwright/test';
import { resetDb, seedProduct } from './helpers';

test('desktop storefront matches the AliStore shop prototype', async ({ page }) => {
  await resetDb();
  await seedProduct('MOTION-E2E');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'iPhone 15 Pro Max' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Каталог', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Поиск по товарам')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Обменяйте старый смартфон' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Хиты продаж' })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);

  await page.goto('/app');
  await expect(page.getByText('iPhone 17 Pro Max')).toBeVisible();
});

test('desktop storefront remains active in a narrow desktop browser window', async ({ page }) => {
  await resetDb();
  await seedProduct('DESKTOP-E2E');
  await page.setViewportSize({ width: 863, height: 954 });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'iPhone 15 Pro Max' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Категории товаров' })).toBeVisible();
  await expect(page.getByText('Доставка 1–2 ч', { exact: true })).toBeHidden();
  const desktopTheme = await page.evaluate(() => {
    const desktop = document.querySelector('.md\\:block');
    const heading = document.querySelector('h1');
    return {
      background: desktop ? getComputedStyle(desktop).backgroundColor : '',
      heading: heading ? getComputedStyle(heading).color : '',
    };
  });
  expect(desktopTheme).toEqual({ background: 'rgb(245, 245, 247)', heading: 'rgb(255, 255, 255)' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(863);

  await page.goto('/catalog');
  await expect(page.getByRole('heading', { name: 'Каталог техники' })).toBeVisible();
  await expect(page.getByPlaceholder('Поиск по названию, SKU и категории')).toBeVisible();
});

test('native-style Client App keeps the dark handoff theme on phone viewports', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 858 });
  await page.goto('/');

  await expect(page.getByText('Доставка 1–2 ч', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'iPhone 15 Pro Max' })).toBeHidden();
  await expect(page.getByText('iPhone 17 Pro Max', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(402);
});
