import { expect, test } from '@playwright/test';
import { postJson, prisma, resetDb, seedProduct, seedStaffCredentials } from './helpers';

test.afterEach(async () => {
  await resetDb();
});

test('POS finds an existing customer and binds the completed sale to that customer', async ({ page, request }) => {
  await resetDb();
  const staff = await seedStaffCredentials('cashier', 'e2e-pos-customer');
  const { product } = await seedProduct('POS-CUSTOMER');
  const customer = await prisma.customer.create({
    data: { phone: '+996700515151', name: 'Айжан POS' },
  });
  await prisma.loyaltyEntry.create({
    data: {
      customerId: customer.id,
      kind: 'earn',
      label: 'E2E бонусы',
      amount: 750,
      sourceRef: `pos-customer-e2e:${customer.id}`,
    },
  });
  await postJson(
    request,
    '/shifts/open',
    { staffId: staff.staffId, point: 'BISHKEK-1', openCash: 5000 },
    staff.accessToken,
    { 'idempotency-key': `e2e-pos-customer-open-${Date.now()}` },
  );

  await page.addInitScript((auth) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(auth));
  }, {
    accessToken: staff.accessToken,
    staffId: staff.staffId,
    username: staff.username,
    role: 'cashier',
    totpEnabled: false,
  });
  await page.goto('/pos');

  await expect(page.getByText('POS · Касса')).toBeVisible();
  const catalog = page.getByTestId('pos-catalog');
  await expect(catalog.getByTestId(`pos-product-${product.id}`)).toBeVisible();
  await catalog.getByTestId(`pos-product-${product.id}`).click();
  await page.getByLabel('Телефон клиента').fill(customer.phone);
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  const ticket = page.getByTestId('pos-ticket');
  await expect(ticket.getByText('Айжан POS')).toBeVisible();
  await expect(ticket.getByText(/750 бонусов/)).toBeVisible();

  await page.getByRole('button', { name: 'К оплате' }).click();
  await page.getByRole('button', { name: 'Наличные' }).click();
  await page.getByRole('button', { name: 'Завершить продажу' }).click();
  await expect(page.getByText('Продажа завершена')).toBeVisible();

  const order = await prisma.order.findFirstOrThrow({
    where: { channel: 'pos' },
    orderBy: { createdAt: 'desc' },
  });
  expect(order).toMatchObject({ customerId: customer.id, status: 'paid' });
});
