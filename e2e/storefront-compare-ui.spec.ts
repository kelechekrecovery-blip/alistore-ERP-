import { expect, test } from '@playwright/test';
import { resetDb, seedProduct } from './helpers';

test('desktop storefront shows the comparison count in the header', async ({ page }) => {
  await resetDb();
  await seedProduct('COMPARE-HEADER-E2E');
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto('/catalog');
  await expect(page.getByRole('heading', { name: 'Каталог техники' })).toBeVisible();
  await page.locator('article').first().getByRole('button', { name: 'Добавить к сравнению' }).click();

  await expect(page.getByRole('link', { name: 'Сравнить' })).toContainText('1');
});
