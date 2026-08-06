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

test('production-like login exposes email, Apple and Google without promising registration', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: () => undefined,
          renderButton: (slot: HTMLElement) => {
            const button = document.createElement('button');
            button.textContent = 'Continue with Google';
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
      phone: { enabled: false, registers: false },
      email: { enabled: true, registers: false },
      telegram: { enabled: false, registers: false, botUsername: null },
      apple: { enabled: true, registers: false, clientId: 'kg.alistore.web' },
      google: { enabled: true, registers: false, clientId: 'web.apps.googleusercontent.com' },
      recovery: { enabled: false },
      anyLoginAvailable: true,
      registrationAvailable: false,
    }),
  }));

  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Войти в аккаунт', exact: true })).toBeVisible();
  await expect(page.getByLabel('Email — привязанная почта', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apple', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  await page.getByTestId('login-channel-phone').click();
  await expect(page.getByRole('status')).toContainText(/SMS сейчас не отправляется/i);
  await expect(page.getByRole('button', { name: 'Apple', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
});

test('Apple sign-in loads the official SDK and submits the verified assertion', async ({ page }) => {
  let appleSdkUrl: string | null = null;
  let requestBody: Record<string, string> | null = null;

  await page.route('https://appleid.cdn-apple.com/appleauth/**', async (route) => {
    appleSdkUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.__appleTest = { initCalls: 0, signInCalls: 0, config: null };
      window.AppleID = { auth: {
        init: (config) => {
          window.__appleTest.initCalls += 1;
          window.__appleTest.config = config;
        },
        signIn: async () => {
          window.__appleTest.signInCalls += 1;
          return { authorization: { id_token: 'apple-id-token' } };
        }
      } };`,
    });
  });
  await page.route('**/auth/methods', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      phone: { enabled: false, registers: false },
      email: { enabled: true, registers: false },
      telegram: { enabled: false, registers: false, botUsername: null },
      apple: { enabled: true, registers: false, clientId: 'kg.alistore.web' },
      google: { enabled: false, registers: false, clientId: null },
      recovery: { enabled: false },
      anyLoginAvailable: true,
      registrationAvailable: false,
    }),
  }));
  await page.route('**/auth/v2/social/apple', async (route) => {
    requestBody = route.request().postDataJSON() as Record<string, string>;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'enrollment_required', enrollmentToken: 'a'.repeat(43), expiresIn: 600 }),
    });
  });

  await page.goto('/login');
  await page.getByRole('button', { name: 'Apple', exact: true }).click();

  await expect.poll(() => appleSdkUrl).toBe(
    'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js',
  );
  await expect.poll(() => requestBody?.identityToken).toBe('apple-id-token');
  expect(requestBody?.nonce).toMatch(/^[a-f0-9]{32}$/);
  const appleTest = await page.evaluate(() => (
    window as unknown as {
      __appleTest: {
        initCalls: number;
        signInCalls: number;
        config: { clientId: string; redirectURI: string; usePopup: boolean; nonce: string };
      };
    }
  ).__appleTest);
  expect(appleTest.initCalls).toBe(1);
  expect(appleTest.signInCalls).toBe(1);
  expect(appleTest.config).toMatchObject({
    clientId: 'kg.alistore.web',
    redirectURI: `${new URL(page.url()).origin}/login`,
    usePopup: true,
    nonce: requestBody?.nonce,
  });
});

test('social sign-in stays visible across code channels and starts phone confirmation', async ({ page }) => {
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
      apple: { enabled: true, registers: true, clientId: 'kg.alistore.web' },
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
  await expect(page.getByRole('button', { name: 'Apple', exact: true })).toBeVisible();
  await page.getByTestId('login-channel-email').click();
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apple', exact: true })).toBeVisible();
  await page.getByTestId('login-channel-phone').click();
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  await page.getByRole('button', { name: /Continue with Google/i }).click();
  await expect(page.getByRole('heading', { name: /Подтвердите номер телефона/i })).toBeVisible();
  expect(requestBody?.identityToken).toBe('google-id-token');
  expect(requestBody?.nonce).toMatch(/^[a-f0-9]{32}$/);
});
