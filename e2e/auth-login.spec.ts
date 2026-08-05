import { expect, test } from '@playwright/test';

test('login rejects an empty phone without an OTP API request', async ({ page }) => {
  let otpRequests = 0;
  await page.route('**/auth/otp/request', async (route) => {
    otpRequests += 1;
    await route.continue();
  });

  await page.goto('/login');
  await page.getByRole('button', { name: /Получить код/i }).click();

  await expect(page.getByText(/Введите корректный номер/i)).toBeVisible();
  expect(otpRequests).toBe(0);
});

test('guest continuation stays unauthenticated', async ({ page }) => {
  await page.goto('/login?next=%2Fcart');
  await page.getByRole('button', { name: /Продолжить как гость/i }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('alistore.auth.v1'))).toBeNull();
  expect(await page.context().cookies()).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'alistore_access' })]),
  );
});

test('browser-unusable social configuration shows the unavailable state', async ({ page }) => {
  await page.route('**/auth/methods', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        phone: { enabled: false, registers: false },
        email: { enabled: false, registers: false },
        telegram: { enabled: false, registers: false, botUsername: null },
        apple: { enabled: true, registers: false, clientId: null },
        recovery: { enabled: false },
        anyLoginAvailable: true,
        registrationAvailable: false,
      }),
    });
  });

  await page.goto('/login');
  await expect(page.getByRole('status')).toContainText(/ни один канал подтверждения не подключён/i);
  await expect(page.getByRole('button', { name: /Получить код/i })).toHaveCount(0);
});
