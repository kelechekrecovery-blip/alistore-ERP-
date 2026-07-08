import { expect, test } from '@playwright/test';
import { postJson, prisma, resetDb, seedProduct } from './helpers';

test('POS UI delta-syncs the cached catalog after staff login', async ({ page, request }) => {
  await resetDb();
  const username = `e2e-pos-ui-${Date.now().toString(36)}`;
  const password = 'pass-e2e';
  await postJson(request, '/staff-auth/bootstrap', { username, password });
  const { product } = await seedProduct('POS-UI');

  await page.goto('/pos');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page.getByText('POS · Касса')).toBeVisible();
  await expect(page.getByText(product.name)).toBeVisible();
  await expect(page.getByText(/Каталог full:/)).toBeVisible();

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
