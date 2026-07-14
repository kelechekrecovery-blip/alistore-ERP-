import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedStaffCredentials } from './helpers';

test('admin manages products with AI enrichment and approval-gated danger actions', async ({ page }) => {
  await resetDb();
  const { username, password } = await seedStaffCredentials('owner', 'e2e-products');
  const bundlePhone = await prisma.product.create({
    data: { sku: `UI-COMP-PHONE-${Date.now()}`, name: 'Bundle phone', price: 90000, cost: 70000, category: 'phones', attrs: {} },
  });
  const bundleCase = await prisma.product.create({
    data: { sku: `UI-COMP-CASE-${Date.now()}`, name: 'Bundle case', price: 3000, cost: 1000, category: 'accessories', attrs: {} },
  });

  const sku = `UI-PRODUCT-${Date.now().toString(36)}`.toUpperCase();
  await page.goto('/admin/products', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page.getByText('Админ · Товары')).toBeVisible();
  await page.locator('input[placeholder="IPHONE-15-128-BLK"]').fill(sku);
  await page.getByLabel('Штрихкод варианта').fill(`194253${Date.now()}`);
  await page.getByLabel('Семья вариантов').fill('iphone-15-ui');
  await page.getByLabel('Состав набора').fill(`${bundlePhone.sku} × 1\n${bundleCase.sku} × 2`);
  await page.getByPlaceholder('iPhone 15 128GB Black').fill('iPhone 15 128GB UI');
  await page.getByPlaceholder('109900').fill('120000');
  await page.getByPlaceholder('92000').fill('90000');
  await page.getByLabel('Attrs JSON').fill('{"storage":"128GB","color":"black"}');

  await page.getByRole('button', { name: 'Авто-категория' }).click();
  await expect(page.getByPlaceholder('phones')).toHaveValue('Смартфоны');
  await page.getByRole('button', { name: 'Сгенерировать описание' }).click();
  await expect(page.getByLabel('Attrs JSON')).toHaveValue(/"description"/);

  await page.getByRole('button', { name: 'Создать товар' }).click();
  await expect(page.getByText(`Создан товар: ${sku}`)).toBeVisible();
  await expect(page.getByText(sku).first()).toBeVisible();

  const created = await prisma.product.findUniqueOrThrow({ where: { sku } });
  expect(created).toMatchObject({
    price: 120000,
    cost: 90000,
    category: 'Смартфоны',
    variantGroup: 'iphone-15-ui',
  });
  expect(await prisma.productBundleComponent.findMany({ where: { bundleProductId: created.id } })).toHaveLength(2);
  expect(created.attrs).toEqual(
    expect.objectContaining({
      storage: '128GB',
      description: expect.stringContaining('iPhone 15 128GB UI'),
    }),
  );

  const aside = page.locator('aside');
  await aside.locator('input').nth(0).fill('160000');
  await aside.locator('input').nth(1).fill('e2e price approval');
  await page.getByRole('button', { name: 'Запросить изменение цены' }).click();
  await expect(page.getByText(/Approval создан:/)).toBeVisible();

  await aside.locator('input').nth(2).fill('e2e archive approval');
  await page.getByRole('button', { name: 'Запросить архив' }).click();
  await expect(page.getByText(/Архивация ждёт approval:/)).toBeVisible();

  const approvals = await prisma.approval.findMany({
    where: { action: { in: ['price', 'delete'] } },
    orderBy: { createdAt: 'asc' },
  });
  expect(approvals.map((approval) => approval.action)).toEqual(['price', 'delete']);
  expect(approvals.map((approval) => approval.evidence)).toEqual([
    expect.objectContaining({ payload: expect.objectContaining({ productId: created.id }) }),
    expect.objectContaining({ payload: expect.objectContaining({ productId: created.id }) }),
  ]);
  await expect(prisma.product.findUniqueOrThrow({ where: { id: created.id } }))
    .resolves.toMatchObject({ price: 120000, archived: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Админ · Товары')).toBeVisible();
  await expect(page.getByPlaceholder('SKU, штрихкод, семья, название')).toBeVisible();
  await page.locator('main section').nth(1).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByRole('button', { name: 'Запросить архив' })).toBeVisible();
});
