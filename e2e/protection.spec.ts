import { expect, test } from '@playwright/test';
import { postJson, prisma, resetDb } from './helpers';

test('customer requests protection for a purchased device', async ({ page, request }) => {
  await resetDb();
  const phone = '+996700940001';
  const customer = await prisma.customer.create({ data: { phone, name: 'Protection E2E' } });
  const product = await prisma.product.create({
    data: {
      sku: `PROTECTION-E2E-${Date.now()}`,
      name: 'iPhone Protection E2E',
      price: 100_000,
      cost: 80_000,
      category: 'phones',
      attrs: {},
    },
  });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      channel: 'web',
      status: 'paid',
      total: product.price,
      items: { create: { sku: product.sku, qty: 1, price: product.price } },
    },
  });
  const unit = await prisma.deviceUnit.create({
    data: {
      imei: `PROTECTION-E2E-${Date.now()}-IMEI`,
      productId: product.id,
      orderId: order.id,
      status: 'sold',
      location: 'BISHKEK-1',
    },
  });
  const challenge = await postJson<{ devCode: string }>(request, '/auth/otp/request', { phone });
  const tokens = await postJson<{ accessToken: string; refreshToken: string }>(
    request,
    '/auth/otp/verify',
    { phone, code: challenge.devCode },
  );
  await page.addInitScript((auth) => {
    localStorage.setItem('alistore.auth.v1', JSON.stringify(auth));
  }, tokens);

  await page.goto('/account/protection');
  await expect(page.getByText('Защита устройства').first()).toBeVisible();
  await page.getByTestId('protection-imei').selectOption(unit.imei);
  await page.getByTestId('protection-submit').click();
  await expect(page.getByRole('status')).toContainText('Заявка на защиту отправлена');

  const policy = await prisma.deviceProtectionPolicy.findFirst({ orderBy: { createdAt: 'desc' } });
  expect(policy).toMatchObject({
    customerId: customer.id,
    orderId: order.id,
    imei: unit.imei,
    planType: 'full_protection',
    coverageMonths: 12,
    premium: 9_000,
    status: 'requested',
  });
  await expect(
    prisma.auditEvent.count({
      where: { type: 'protection.requested', refs: { has: policy?.id } },
    }),
  ).resolves.toBe(1);
});
