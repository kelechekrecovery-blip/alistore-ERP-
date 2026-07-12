import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedProduct, seedStaffCredentials } from './helpers';

test('POS UI delta-syncs the cached catalog after staff login', async ({ page, request }) => {
  await resetDb();
  const { username, password } = await seedStaffCredentials('owner', 'e2e-pos-ui');
  const { product } = await seedProduct('POS-UI');

  await page.goto('/pos');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page.getByText('POS · Касса')).toBeVisible();
  await expect(page.getByText(product.name)).toBeVisible();
  await expect(page.getByText(/Каталог full:/)).toBeVisible();

  const terminal = page.getByTestId('pos-terminal');
  const catalog = page.getByTestId('pos-catalog');
  const ticket = page.getByTestId('pos-ticket');
  await expect(page.getByPlaceholder('Поиск или скан штрихкода…')).toBeVisible();
  await expect(ticket).toHaveCSS('width', '420px');
  await expect(ticket).toHaveCSS('background-color', 'rgb(26, 22, 17)');
  await expect(terminal).toHaveCSS('background-color', 'rgb(22, 19, 15)');

  const layout = await Promise.all([terminal, catalog, ticket].map((locator) => locator.boundingBox()));
  expect(layout.every(Boolean)).toBe(true);
  expect(layout[0]!.width).toBeLessThanOrEqual(1180);
  expect(layout[1]!.width).toBeGreaterThan(layout[2]!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );

  const renamed = `${product.name} Delta`;
  await new Promise((resolve) => setTimeout(resolve, 10));
  await prisma.product.update({
    where: { id: product.id },
    data: { name: renamed },
  });

  await page.reload();
  await expect(page.getByText(renamed)).toBeVisible();
  await expect(page.getByText(/Каталог delta: \+1 \/ -0/)).toBeVisible();
});
