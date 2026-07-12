import { expect, test } from '@playwright/test';
import { sign } from 'jsonwebtoken';
import { prisma, resetDb, seedProduct } from './helpers';

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

test('desktop catalog, product and cart keep the exact shop visual system', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('INNER-SHOP-E2E', 124990);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto('/catalog');
  await expect(page.getByRole('heading', { name: 'Каталог техники' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'В корзину' })).toBeVisible();
  const catalogTheme = await page.evaluate(() => {
    const desktop = document.querySelector('.md\\:block');
    const card = document.querySelector('article');
    return {
      background: desktop ? getComputedStyle(desktop).backgroundColor : '',
      card: card ? getComputedStyle(card).backgroundColor : '',
      border: card ? getComputedStyle(card).borderTopColor : '',
    };
  });
  expect(catalogTheme).toEqual({
    background: 'rgb(245, 245, 247)',
    card: 'rgb(255, 255, 255)',
    border: 'rgb(229, 229, 231)',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);

  await page.goto(`/product/${product.id}`);
  await expect(page.getByRole('heading', { name: product.name })).toBeVisible();
  await page.getByRole('button', { name: 'В корзину' }).click();
  await page.goto('/cart');
  await expect(page.locator('.md\\:block').getByRole('link', { name: product.name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Перейти к оформлению' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
});

test('remaining desktop customer routes use the shop system through account entry', async ({ page }) => {
  await resetDb();
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto('/search?q=iphone');
  await expect(page).toHaveURL(/\/catalog\?q=iphone$/);

  await page.goto('/favorites');
  expect(await page.locator('.md\\:block').first().evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(245, 245, 247)');
  await page.goto('/compare');
  expect(await page.locator('main').locator('..').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(245, 245, 247)');
  await page.goto('/login?next=/account');
  expect(await page.locator('.login-shell').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(245, 245, 247)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);

  const customer = await prisma.customer.create({ data: { phone: '+996700990021', name: 'Visual Route Customer' } });
  const accessToken = sign(
    { sub: customer.id, phone: customer.phone, typ: 'customer' },
    'dev-secret-alistore-local',
    { expiresIn: '1h' },
  );
  await page.evaluate((tokens) => {
    localStorage.setItem('alistore.auth.v1', JSON.stringify(tokens));
  }, { accessToken, refreshToken: 'visual-route-test' });
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
  expect(await page.locator('.md\\:block').first().evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(245, 245, 247)');

  for (const route of ['/account/addresses', '/account/bonuses', '/account/settings', '/support', '/trade-in']) {
    await page.goto(route);
    await expect(page.locator('.customer-service-title')).toBeVisible();
    expect(await page.locator('.customer-service-shell').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(245, 245, 247)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  }
});
