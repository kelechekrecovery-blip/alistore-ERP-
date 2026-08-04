import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedProduct } from './helpers';

// Срез 6 (docs/SUPPLY-TO-ORDER-PLAN.md): checkout больше не называет чужой
// город. Раньше подпись самовывоза была захардкожена как конкретный магазин
// в Бишкеке независимо от того, какую точку реально отдаёт сервер — покупатель
// в Манасе видел чужую идентичность. Тест держит точку Манаса первой по
// sortOrder и проверяет, что подпись берётся из StorePoint, а не из константы.
test('checkout pickup subtitle names the actual served store point, not a hardcoded city', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('IDENTITY-E2E');

  // resetDb сохраняет alistore-bishkek-1 — сдвигаем его за точку Манаса и
  // заводим отдельный самовывоз в Манасе с отличимым именем/часами.
  await prisma.storePoint.update({
    where: { id: 'alistore-bishkek-1' },
    data: { sortOrder: 50 },
  });
  await prisma.storePoint.create({
    data: {
      id: 'alistore-manas-1',
      code: 'manas',
      name: 'AliStore Манас',
      address: 'Манас, ул. Ленина 1',
      inventoryLocation: 'MANAS-1',
      hours: 'Ежедневно 10:00–20:00',
      active: true,
      sortOrder: 0,
      createdBy: 'e2e-identity',
      idempotencyKey: 'e2e:store-point:manas-1',
    },
  });

  await page.addInitScript((item) => {
    localStorage.setItem('alistore.cart.v1', JSON.stringify([{ ...item, qty: 1 }]));
    localStorage.removeItem('alistore.cart.pricing.v1');
  }, { id: product.id, sku: product.sku, name: product.name, price: product.price });

  await page.goto('/checkout');
  await expect(page.getByText('Способ получения')).toBeVisible();

  // Точка Манаса первая по sortOrder → выбрана по умолчанию → её имя и часы
  // должны появиться в подписи самовывоза.
  await expect(page.getByText('AliStore Манас · Ежедневно 10:00–20:00')).toBeVisible();

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain('AliStore Центр · сегодня');
  expect(bodyText).not.toContain('по Бишкеку');
});
