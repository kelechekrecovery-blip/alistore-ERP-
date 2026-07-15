import { expect, test } from '@playwright/test';
import { resetDb, seedProduct, seedStaffCredentials } from './helpers';

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
