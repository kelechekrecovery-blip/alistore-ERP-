import { expect, test } from '@playwright/test';

test('login rejects an empty phone without an API request', async ({ page }) => {
  let otpRequests = 0;
  await page.route('**/auth/otp/request', async (route) => {
    otpRequests += 1;
    await route.continue();
  });

  await page.goto('/login');
  await page.getByRole('button', { name: /Получить код/i }).first().click();
  await expect(page.getByText(/корректный номер/i)).toBeVisible();
  expect(otpRequests).toBe(0);
});

test('guest continuation returns to storefront without an access token', async ({ page }) => {
  await page.goto('/login?next=%2Fcart');
  await page.getByRole('button', { name: /Продолжить как гость/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('alistore.auth.v1'))).toBeNull();
});

