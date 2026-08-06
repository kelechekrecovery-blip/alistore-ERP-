import { expect, test, type Page, type Route } from '@playwright/test';

const productionMethods = {
  phone: { enabled: false, registers: false },
  email: { enabled: true, registers: false },
  telegram: { enabled: false, registers: false, botUsername: null },
  apple: {
    enabled: true,
    registers: false,
    clientId: 'kg.alistore.web',
    redirectUri: 'https://ali.kg/login',
  },
  google: {
    enabled: true,
    registers: false,
    clientId: 'google-web-client.apps.googleusercontent.com',
  },
  recovery: { enabled: false },
  anyLoginAvailable: true,
  registrationAvailable: false,
};

async function exposeSocialSdks(page: Page) {
  await page.addInitScript(() => {
    const browser = window as typeof window & {
      __appleInit?: Record<string, unknown>;
      AppleID?: {
        auth: {
          init(config: Record<string, unknown>): void;
          signIn(): Promise<Record<string, unknown>>;
        };
      };
      google?: {
        accounts: {
          id: {
            initialize(): void;
            renderButton(): void;
          };
        };
      };
    };
    browser.AppleID = {
      auth: {
        init(config) {
          browser.__appleInit = config;
        },
        async signIn() {
          return {
            authorization: {
              code: 'apple-web-authorization-code',
              id_token: 'apple.web.identity.token',
            },
          };
        },
      },
    };
    browser.google = {
      accounts: {
        id: {
          initialize() {},
          renderButton() {},
        },
      },
    };
  });
}

async function mockProductionMethods(page: Page) {
  await page.route('**/api/auth/methods', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(productionMethods),
  }));
}

async function fulfillAuthenticated(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'authenticated',
      accessToken: 'apple-web-access-token',
      refreshToken: 'apple-web-refresh-token',
      tokenType: 'Bearer',
      expiresIn: '15m',
    }),
  });
}

async function mockAuthenticatedCustomer(page: Page) {
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      customerId: 'apple-customer',
      phone: '+996700211111',
      typ: 'customer',
    }),
  }));
}

test('linked Apple user can sign in when SMS registration is disabled', async ({ page }) => {
  await exposeSocialSdks(page);
  await mockProductionMethods(page);
  await mockAuthenticatedCustomer(page);
  await page.route('**/api/auth/v2/social/apple', fulfillAuthenticated);

  await page.goto('/login?next=/cart');

  await expect(page.getByTestId('login-channel-email')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Войти в аккаунт' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apple' })).toBeVisible();
  const appleRequest = page.waitForRequest((request) =>
    request.url().endsWith('/auth/v2/social/apple') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Apple' }).click();
  const payload = (await appleRequest).postDataJSON() as Record<string, string>;

  expect(payload).toMatchObject({
    identityToken: 'apple.web.identity.token',
    authorizationCode: 'apple-web-authorization-code',
  });
  expect(payload.nonce).toMatch(/^[a-f0-9]{32}$/);
  const config = await page.evaluate(() => (
    window as typeof window & { __appleInit?: Record<string, unknown> }
  ).__appleInit);
  expect(config).toMatchObject({
    clientId: 'kg.alistore.web',
    redirectURI: 'https://ali.kg/login',
    usePopup: true,
    nonce: payload.nonce,
  });
  await expect(page).toHaveURL((url) => url.pathname === '/cart');
});

test('unknown Apple user gets an explicit SMS blocker instead of a dead enrollment form', async ({ page }) => {
  await exposeSocialSdks(page);
  await mockProductionMethods(page);
  await page.route('**/api/auth/v2/social/apple', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'enrollment_required',
      enrollmentToken: 'memory-only-enrollment-token',
      expiresIn: 600,
    }),
  }));

  await page.goto('/login');
  await page.getByRole('button', { name: 'Apple' }).click();

  await expect(page.getByText(/Apple сейчас доступен только тем, кто уже привязал номер телефона/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Подтвердите номер телефона' })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage)))
    .not.toContain('memory-only-enrollment-token');
});
