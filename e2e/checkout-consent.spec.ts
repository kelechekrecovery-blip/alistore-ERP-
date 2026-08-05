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

/**
 * Оферта опубликована — на неё можно ссылаться в согласии.
 *
 * Текст документа живёт в настройке `legal.offer_text` и заполняется владельцем.
 * Пока он пуст, оферты не существует, и утверждать, будто покупатель с ней
 * согласился, нельзя — это проверяет отдельный тест ниже.
 */
async function unpublishOffer(): Promise<void> {
  // `resetDb()` не трогает таблицу настроек — оферта, опубликованная соседним
  // тестом или прошлым прогоном, переживает сброс. Предусловие «документа нет»
  // тест обязан ставить сам, иначе он проверяет то, что осталось от других.
  await prisma.setting.deleteMany({ where: { key: 'legal.offer_text' } });
}

async function publishOffer(): Promise<void> {
  await prisma.setting.upsert({
    where: { key: 'legal.offer_text' },
    create: { key: 'legal.offer_text', value: '1. Общие положения\n\nПродавец: ОсОО «Тест».', updatedBy: 'e2e' },
    update: { value: '1. Общие положения\n\nПродавец: ОсОО «Тест».' },
  });
}

test('без опубликованной оферты согласие ссылается только на политику данных', async ({ page }) => {
  // Ссылаться на договор, которого нет, — значит собирать юридически пустое
  // согласие. Галочка остаётся обязательной: обработка данных опубликована.
  await resetDb();
  await unpublishOffer();
  const { product } = await seedProduct('CONSENT-NO-OFFER');
  await reachConfirmationStep(page, product);

  const consent = page.getByLabel(/Согласен с условиями/);
  await expect(consent).not.toBeChecked();
  await expect(page.getByRole('link', { name: 'обработки персональных данных' })).toHaveAttribute('href', '/privacy');
  await expect(page.getByRole('link', { name: 'публичной оферты' })).toHaveCount(0);

  const submit = page.getByRole('button', { name: /Подтвердить заказ/ });
  await expect(submit).toBeDisabled();
  await consent.check();
  await expect(submit).toBeEnabled();
});

test('checkout blocks order submission until the legal consent checkbox is ticked', async ({ page }) => {
  await resetDb();
  await publishOffer();
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
  await publishOffer();
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
