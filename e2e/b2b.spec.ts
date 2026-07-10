import { expect, test } from '@playwright/test';
import { postJson, prisma, resetDb, seedProduct } from './helpers';

test('business buyer submits an invoice quote request from the catalog', async ({ page, request }) => {
  await resetDb();
  const { product } = await seedProduct('B2B-E2E', 120_000, 90_000);
  const { product: accessory } = await seedProduct('B2B-E2E-ACC', 50_000, 30_000);
  const phone = '+996700930001';
  const challenge = await postJson<{ devCode: string }>(request, '/auth/otp/request', { phone });
  const tokens = await postJson<{ accessToken: string; refreshToken: string }>(
    request,
    '/auth/otp/verify',
    { phone, code: challenge.devCode },
  );

  await page.addInitScript((auth) => {
    localStorage.setItem('alistore.auth.v1', JSON.stringify(auth));
  }, tokens);
  await page.goto('/b2b');
  await expect(page.getByText('AliStore для бизнеса')).toBeVisible();

  await page.getByTestId('b2b-company').fill('ОсОО E2E Business');
  await page.getByTestId('b2b-tax-id').fill('12345678901234');
  await page.getByTestId('b2b-contact').fill('E2E Buyer');
  await page.getByTestId('b2b-address').fill('Бишкек, Киевская 95');
  await page.getByTestId('b2b-sku').selectOption(product.sku);
  await page.getByTestId('b2b-qty').fill('12');
  await page.getByTestId('b2b-target').fill('110000');
  await page.getByRole('button', { name: 'Добавить товар' }).click();
  await page.getByTestId('b2b-sku-1').selectOption(accessory.sku);
  await page.getByTestId('b2b-qty-1').fill('3');
  await page.getByTestId('b2b-comment').fill('Счёт и поставка до конца месяца');
  await page.getByTestId('b2b-submit').click();

  await expect(page.getByRole('status')).toContainText('Заявка отправлена');
  const quote = await prisma.b2BQuote.findFirst({
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
  expect(quote).toMatchObject({
    status: 'requested',
    paymentIntent: 'invoice',
    fulfillmentType: 'delivery',
    listTotal: 1_590_000,
  });
  expect(quote?.items).toHaveLength(2);
  expect(quote?.items[0]).toMatchObject({
    sku: product.sku,
    qty: 12,
    listPrice: 120_000,
    targetPrice: 110_000,
  });
  await expect(
    prisma.auditEvent.count({
      where: { type: 'b2b.quote_requested', refs: { has: quote?.id } },
    }),
  ).resolves.toBe(1);
});
