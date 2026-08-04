import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedProduct } from './helpers';

async function reachConfirmationStep(page: import('@playwright/test').Page, product: { id: string; sku: string; name: string; price: number }) {
  await page.addInitScript((item) => {
    localStorage.setItem('alistore.cart.v1', JSON.stringify([{ ...item, qty: 1 }]));
    localStorage.removeItem('alistore.cart.pricing.v1');
  }, { id: product.id, sku: product.sku, name: product.name, price: product.price });

  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Далее' }).last().click();
  await page.getByPlaceholder('+996 700 12 34 56').fill(`+996700${Date.now().toString().slice(-6)}`);
  await page.getByPlaceholder('Имя').fill('Consent Buyer');
  await page.getByRole('button', { name: 'Далее' }).last().click();
  await page.getByRole('button', { name: /Картой/ }).click();
  await page.getByRole('button', { name: 'К подтверждению' }).click();
}

test('checkout blocks order submission until the legal consent checkbox is ticked', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('CONSENT-BLOCKED');
  await reachConfirmationStep(page, product);

  const consent = page.getByLabel(/Согласен с условиями/);
  await expect(consent).not.toBeChecked();
  await expect(page.getByRole('link', { name: 'публичной оферты' })).toHaveAttribute('href', '/oferta');
  await expect(page.getByRole('link', { name: 'обработкой персональных данных' })).toHaveAttribute('href', '/privacy');
  const submit = page.getByRole('button', { name: /Подтвердить заказ/ });
  await expect(submit).toBeDisabled();

  await consent.check();
  await expect(submit).toBeEnabled();
  await consent.uncheck();
  await expect(submit).toBeDisabled();
  expect(await prisma.order.count()).toBe(0);
});

test('checkout with consent creates an order stamped with piiConsentAt', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('CONSENT-GRANTED');
  await reachConfirmationStep(page, product);

  await page.getByLabel(/Согласен с условиями/).check();
  await page.getByRole('button', { name: /Подтвердить заказ/ }).click();
  await expect(page.getByText('Ожидаем оплату')).toBeVisible();
  await page.getByRole('button', { name: /Подтвердить sandbox/ }).click();
  await expect(page.getByText('Заказ оформлен!')).toBeVisible();

  const order = await prisma.order.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
  expect(order).toMatchObject({ status: 'paid', channel: 'web' });
  expect(order.piiConsentAt).not.toBeNull();
});
