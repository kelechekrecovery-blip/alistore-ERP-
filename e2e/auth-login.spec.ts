import { expect, test } from '@playwright/test';

test('login rejects an empty phone without an OTP API request', async ({ page }) => {
  let otpRequests = 0;
  await page.route('**/auth/methods', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      phone: { enabled: true, registers: true },
      email: { enabled: false, registers: false },
      telegram: { enabled: false, registers: false, botUsername: null },
      apple: { enabled: false, registers: false, clientId: null, redirectUri: null },
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

  const methodsLoaded = page.waitForResponse((response) => response.url().includes('/auth/methods'));
  await page.goto('/login');
  // The validation handler is client-side. Wait for the capability request so
  // this checks the hydrated form instead of racing Next.js hydration and
  // accidentally exercising a native form navigation.
  await methodsLoaded;
  await page.getByRole('button', { name: /Получить код/i }).first().click();
  await expect(page.getByText(/корректный номер/i)).toBeVisible();
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
        apple: { enabled: true, registers: false, clientId: null, redirectUri: null },
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

test('Apple sign-in loads the official SDK and sends the authorization code', async ({ page }) => {
  let appleSdkUrl: string | null = null;
  let requestBody: Record<string, string> | null = null;

  await page.route('https://appleid.cdn-apple.com/appleauth/**', async (route) => {
    appleSdkUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.AppleID = { auth: {
        init: (config) => { window.__appleConfig = config; },
        signIn: async () => ({ authorization: {
          id_token: 'apple-id-token',
          code: 'apple-authorization-code'
        } })
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
      apple: {
        enabled: true,
        registers: false,
        clientId: 'kg.alistore.web',
        redirectUri: 'https://ali.kg/login',
      },
      google: { enabled: false, registers: false, clientId: null },
      recovery: { enabled: false },
      anyLoginAvailable: true,
      registrationAvailable: false,
    }),
  }));
  await page.route('**/auth/v2/social/apple', async (route) => {
    requestBody = route.request().postDataJSON() as Record<string, string>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'enrollment_required',
        enrollmentToken: 'a'.repeat(43),
        expiresIn: 600,
      }),
    });
  });

  await page.goto('/login');
  await page.getByRole('button', { name: 'Apple', exact: true }).click();

  await expect.poll(() => appleSdkUrl).toBe(
    'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js',
  );
  await expect.poll(() => requestBody?.identityToken).toBe('apple-id-token');
  expect(requestBody).toMatchObject({
    authorizationCode: 'apple-authorization-code',
  });
  expect(requestBody?.nonce).toMatch(/^[a-f0-9]{32}$/);
  const config = await page.evaluate(() => (
    window as typeof window & { __appleConfig?: Record<string, unknown> }
  ).__appleConfig);
  expect(config).toMatchObject({
    clientId: 'kg.alistore.web',
    redirectURI: 'https://ali.kg/login',
    usePopup: true,
    nonce: requestBody?.nonce,
  });
});

test('locked phone confirmation explains that a new code is required', async ({ page }) => {
  await page.route('**/auth/methods', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      phone: { enabled: true, registers: true },
      email: { enabled: false, registers: false },
      telegram: { enabled: false, registers: false, botUsername: null },
      apple: { enabled: false, registers: false, clientId: null, redirectUri: null },
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

test('recovery verification never exposes whether the customer exists', async ({ page }) => {
  await page.route('**/auth/methods', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      phone: { enabled: true, registers: true },
      email: { enabled: false, registers: false },
      telegram: { enabled: false, registers: false, botUsername: null },
      apple: { enabled: false, registers: false, clientId: null, redirectUri: null },
      google: { enabled: false, registers: false, clientId: null },
      recovery: { enabled: true },
      anyLoginAvailable: true,
      registrationAvailable: true,
    }),
  }));
  await page.route('**/auth/recovery/request', (route) => route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ challengeId: 'recovery-challenge', devCode: '123456' }),
  }));
  await page.route('**/auth/recovery/verify', (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ statusCode: 404, code: 'customer_not_found', message: 'Customer not found' }),
  }));

  await page.goto('/login');
  await page.getByTestId('login-mode-recover').click();
  await page.getByLabel(/номер телефона/i).fill('+996 555 123 456');
  await page.getByRole('button', { name: /Получить код восстановления/i }).click();
  await page.getByRole('button', { name: /Восстановить доступ/i }).click();

  await expect(page.getByText('Не удалось восстановить доступ. Проверьте код и попробуйте ещё раз.', { exact: true })).toBeVisible();
  await expect(page.getByText(/аккаунт.*не найден/i)).toHaveCount(0);
});

test('recovery request never exposes whether the customer exists', async ({ page }) => {
  await page.route('**/auth/methods', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      phone: { enabled: true, registers: true },
      email: { enabled: false, registers: false },
      telegram: { enabled: false, registers: false, botUsername: null },
      apple: { enabled: false, registers: false, clientId: null, redirectUri: null },
      google: { enabled: false, registers: false, clientId: null },
      recovery: { enabled: true },
      anyLoginAvailable: true,
      registrationAvailable: true,
    }),
  }));
  await page.route('**/auth/recovery/request', (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ statusCode: 404, code: 'customer_not_found', message: 'Customer not found' }),
  }));

  await page.goto('/login');
  await page.getByTestId('login-mode-recover').click();
  await page.getByLabel(/номер телефона/i).fill('+996 555 123 456');
  await page.getByRole('button', { name: /Получить код восстановления/i }).click();

  await expect(page.getByText('Не удалось отправить код восстановления. Попробуйте позже.', { exact: true })).toBeVisible();
  await expect(page.getByText(/аккаунт.*не найден/i)).toHaveCount(0);
});

test('OTP request is single-flight and confirmation stays bound to its identity', async ({ page }) => {
  let otpRequests = 0;
  let releaseOtp: (() => void) | undefined;
  let verifyBody: Record<string, string> | null = null;
  const otpResponse = new Promise<void>((resolve) => { releaseOtp = resolve; });

  await page.route('**/auth/methods', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      phone: { enabled: true, registers: true },
      email: { enabled: false, registers: false },
      telegram: { enabled: false, registers: false, botUsername: null },
      apple: { enabled: false, registers: false, clientId: null, redirectUri: null },
      google: { enabled: false, registers: false, clientId: null },
      recovery: { enabled: false },
      anyLoginAvailable: true,
      registrationAvailable: true,
    }),
  }));
  await page.route('**/auth/otp/request', async (route) => {
    otpRequests += 1;
    await otpResponse;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ challengeId: 'identity-bound-challenge', devCode: '123456' }),
    });
  });
  await page.route('**/auth/otp/verify', (route) => {
    verifyBody = route.request().postDataJSON() as Record<string, string>;
    return route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 422, code: 'otp_invalid', message: 'Invalid OTP' }),
    });
  });

  await page.goto('/login');
  const phoneInput = page.getByLabel(/номер телефона/i);
  await phoneInput.fill('+996 555 123 456');
  await page.getByRole('button', { name: /Получить код по SMS/i }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
    const input = document.querySelector('input[type="tel"]') as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, '+996700999999');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => otpRequests).toBe(1);
  releaseOtp?.();
  await expect(page.getByText(/dev-код: 123456/i)).toBeVisible();
  await page.getByRole('button', { name: /Войти или создать аккаунт/i }).click();

  await expect.poll(() => verifyBody?.phone).toBe('+996555123456');
  expect(verifyBody?.challengeId).toBe('identity-bound-challenge');
});

test('a delayed recovery response cannot become a login challenge', async ({ page }) => {
  let recoveryRequested = false;
  let releaseRecovery: (() => void) | undefined;
  const recoveryResponse = new Promise<void>((resolve) => { releaseRecovery = resolve; });

  await page.route('**/auth/methods', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      phone: { enabled: true, registers: true },
      email: { enabled: true, registers: false },
      telegram: { enabled: false, registers: false, botUsername: null },
      apple: { enabled: false, registers: false, clientId: null, redirectUri: null },
      google: { enabled: false, registers: false, clientId: null },
      recovery: { enabled: true },
      anyLoginAvailable: true,
      registrationAvailable: true,
    }),
  }));
  await page.route('**/auth/recovery/request', async (route) => {
    recoveryRequested = true;
    await recoveryResponse;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ challengeId: 'late-recovery-challenge', devCode: '111111' }),
    });
  });
  await page.route('**/auth/otp/request', (route) => route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ challengeId: 'login-challenge', devCode: '222222' }),
  }));

  await page.goto('/login');
  await page.getByTestId('login-mode-recover').click();
  await page.getByLabel(/номер телефона/i).fill('+996 555 123 456');
  // Queue both clicks in one browser task. React has not painted `disabled`
  // after the request click yet, so this reproduces the narrow real race that
  // the generation guard covers in addition to the disabled controls.
  await page.getByRole('button', { name: /Получить код восстановления/i }).evaluate((requestButton) => {
    (requestButton as HTMLButtonElement).click();
    (document.querySelector('[data-testid="login-mode-login"]') as HTMLButtonElement).click();
  });
  await expect.poll(() => recoveryRequested).toBe(true);
  await expect(page.getByTestId('login-mode-login')).toHaveAttribute('aria-pressed', 'true');

  releaseRecovery?.();
  await expect(page.getByRole('button', { name: /Получить код по SMS/i })).toBeEnabled();
  await expect(page.getByText(/dev-код: 111111/i)).toHaveCount(0);

  await page.getByRole('button', { name: /Получить код по SMS/i }).click();
  await expect(page.getByText(/dev-код: 222222/i)).toBeVisible();
  await expect(page.getByText(/dev-код: 111111/i)).toHaveCount(0);
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
      apple: {
        enabled: true,
        registers: false,
        clientId: 'kg.alistore.web',
        redirectUri: 'https://ali.kg/login',
      },
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
  await page.getByRole('button', { name: 'Телефон', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(/SMS сейчас не отправляется/i);
  await expect(page.getByRole('button', { name: 'Apple', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
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
      apple: { enabled: false, registers: false, clientId: null, redirectUri: null },
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
          return { authorization: {
            id_token: 'apple-id-token',
            code: 'apple-authorization-code'
          } };
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
      apple: {
        enabled: true,
        registers: false,
        clientId: 'kg.alistore.web',
        redirectUri: 'https://ali.kg/login',
      },
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
  expect(requestBody?.authorizationCode).toBe('apple-authorization-code');
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
    redirectURI: 'https://ali.kg/login',
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
      apple: {
        enabled: true,
        registers: true,
        clientId: 'kg.alistore.web',
        redirectUri: 'https://ali.kg/login',
      },
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
  // Social sign-in is independent of the OTP tab. Keep it reachable from the
  // email-first production state so an already-linked customer can still sign
  // in while SMS is unavailable. A new identity switches to phone only after
  // the provider returns `enrollment_required`.
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apple', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Continue with Google/i }).click();
  await expect(page.getByRole('heading', { name: /Подтвердите номер телефона/i })).toBeVisible();
  await expect(page.getByTestId('login-channel-phone')).toHaveCount(0);
  expect(requestBody?.identityToken).toBe('google-id-token');
  expect(requestBody?.nonce).toMatch(/^[a-f0-9]{32}$/);
});
