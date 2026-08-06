import { expect, test } from '@playwright/test';

test('login rejects an empty phone without an API request', async ({ page }) => {
  let otpRequests = 0;
  await page.route('**/auth/methods', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      phone: { enabled: true, registers: true },
      email: { enabled: false, registers: false },
      telegram: { enabled: false, registers: false, botUsername: null },
      apple: { enabled: false, registers: false, clientId: null },
      google: { enabled: false, registers: false, clientId: null },
      recovery: { enabled: false },
      anyLoginAvailable: true,
      registrationAvailable: true,
    }),
  }));
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
        google: { enabled: false, registers: false, clientId: null },
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

test('locked phone confirmation explains that a new code is required', async ({ page }) => {
  await page.route('**/auth/methods', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      phone: { enabled: true, registers: true },
      email: { enabled: false, registers: false },
      telegram: { enabled: false, registers: false, botUsername: null },
      apple: { enabled: false, registers: false, clientId: null },
      google: { enabled: false, registers: false, clientId: null },
      recovery: { enabled: true },
      anyLoginAvailable: true,
      registrationAvailable: true,
    }),
  }));
  await page.route('**/auth/otp/request', (route) => route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ challengeId: 'locked-challenge', devCode: '123456' }),
  }));
  await page.route('**/auth/otp/verify', (route) => route.fulfill({
    status: 422,
    contentType: 'application/json',
    body: JSON.stringify({
      statusCode: 422,
      code: 'otp_locked',
      message: 'OTP challenge is locked',
    }),
  }));

  await page.goto('/login');
  await page.getByLabel(/номер телефона/i).fill('+996 555 123 456');
  await page.getByRole('button', { name: /Получить код/i }).click();
  await page.getByRole('button', { name: /Войти или создать аккаунт/i }).click();

  await expect(page.getByText('Слишком много попыток. Запросите новый код.', { exact: true })).toBeVisible();
});

test('Google provider failure keeps its actionable server error', async ({ page }) => {
  await page.addInitScript(() => {
    let callback: ((response: { credential: string }) => void) | undefined;
    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: (config: { callback: (response: { credential: string }) => void }) => { callback = config.callback; },
          renderButton: (slot: HTMLElement) => {
            const button = document.createElement('button');
            button.textContent = 'Continue with Google';
            button.onclick = () => callback?.({ credential: 'google-id-token' });
            slot.appendChild(button);
          },
        },
      },
    };
  });
  await page.route('**/auth/methods', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      phone: { enabled: true, registers: true },
      email: { enabled: false, registers: false },
      telegram: { enabled: false, registers: false, botUsername: null },
      apple: { enabled: false, registers: false, clientId: null },
      google: { enabled: true, registers: true, clientId: 'web.apps.googleusercontent.com' },
      recovery: { enabled: false },
      anyLoginAvailable: true,
      registrationAvailable: true,
    }),
  }));
  await page.route('**/auth/v2/social/google', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({
      statusCode: 503,
      code: 'social_provider_not_configured',
      message: 'Google is not configured',
    }),
  }));

  await page.goto('/login');
  await page.getByRole('button', { name: /Continue with Google/i }).click();
  await expect(page.getByText('Этот способ входа временно недоступен.', { exact: true })).toBeVisible();
});

test('Google sign-in starts phone confirmation for a new account', async ({ page }) => {
  await page.addInitScript(() => {
    let callback: ((response: { credential: string }) => void) | undefined;
    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: (config: { callback: (response: { credential: string }) => void }) => { callback = config.callback; },
          renderButton: (slot: HTMLElement) => {
            const button = document.createElement('button');
            button.textContent = 'Continue with Google';
            button.onclick = () => callback?.({ credential: 'google-id-token' });
            slot.appendChild(button);
          },
        },
      },
    };
  });
  await page.route('**/auth/methods', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      phone: { enabled: true, registers: true },
      email: { enabled: true, registers: false },
      telegram: { enabled: false, registers: false, botUsername: null },
      apple: { enabled: false, registers: false, clientId: null },
      google: { enabled: true, registers: true, clientId: 'web.apps.googleusercontent.com' },
      recovery: { enabled: true },
      anyLoginAvailable: true,
      registrationAvailable: true,
    }),
  }));
  let requestBody: Record<string, string> | null = null;
  await page.route('**/auth/v2/social/google', async (route) => {
    requestBody = route.request().postDataJSON() as Record<string, string>;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'enrollment_required', enrollmentToken: 'g'.repeat(43), expiresIn: 600 }),
    });
  });

  await page.goto('/login');
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  await page.getByTestId('login-channel-email').click();
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toHaveCount(0);
  await page.getByTestId('login-channel-phone').click();
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  await page.getByRole('button', { name: /Continue with Google/i }).click();
  await expect(page.getByRole('heading', { name: /Подтвердите номер телефона/i })).toBeVisible();
  expect(requestBody?.identityToken).toBe('google-id-token');
  expect(requestBody?.nonce).toMatch(/^[a-f0-9]{32}$/);
});
