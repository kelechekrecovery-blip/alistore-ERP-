import { expect, test, type Page, type Route } from '@playwright/test';

const enrollmentToken = 'telegram-enrollment-token-only-in-react-memory';
const accessToken = 'telegram-web-access-token';
const phone = '+996700211111';

/**
 * Витрина больше не решает сама, какие входы показать: она спрашивает сервер
 * (`GET /auth/methods`) и рисует только живые каналы. Кнопка Telegram теперь
 * появляется лишь когда бот настроен — раньше она рисовалась при любом
 * `initData` и вела в отказ `social_provider_not_configured`.
 *
 * Этот сценарий подменяет сервер целиком, поэтому справочник обязан быть
 * подменён вместе с остальными ответами: без него страница честно скрыла бы
 * кнопку, и тест проверял бы отсутствующий элемент.
 */
async function mockAuthMethods(page: Page) {
  await page.route('**/api/auth/methods', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      phone: { enabled: true, registers: true },
      email: { enabled: false, registers: false },
      // `botUsername: null` — виджет для обычного браузера не нужен: внутри
      // Mini App вход идёт подписанным initData.
      telegram: { enabled: true, registers: true, botUsername: null },
      apple: { enabled: false, registers: false, clientId: null, redirectUri: null },
      recovery: { enabled: false },
      anyLoginAvailable: true,
      registrationAvailable: true,
    }),
  }));
}

async function exposeTelegram(page: Page, initData = 'signed-telegram-init-data') {
  await mockAuthMethods(page);
  await page.addInitScript((value) => {
    (window as typeof window & {
      Telegram?: { WebApp?: { initData: string; ready: () => void } };
    }).Telegram = { WebApp: { initData: value, ready: () => undefined } };
  }, initData);
}

async function fulfillAuthenticated(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'authenticated',
      accessToken,
      refreshToken: 'telegram-web-refresh-token',
      tokenType: 'Bearer',
      expiresIn: '15m',
    }),
  });
}

async function mockMe(page: Page) {
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ customerId: 'telegram-customer', phone, typ: 'customer' }),
  }));
  await page.route('**/api/customers/me/loyalty', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ balance: 0 }),
  }));
}

async function beginEnrollment(page: Page) {
  await exposeTelegram(page);
  await page.route('**/api/auth/v2/social/telegram', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'enrollment_required',
      enrollmentToken,
      expiresIn: 600,
    }),
  }));
  await page.goto('/login?next=/cart');
  await page.getByRole('button', { name: 'Telegram' }).click();
  await expect(page.getByText('Подтвердите номер телефона')).toBeVisible();
}

test('linked Telegram identity follows the existing success path and preserves next/cart state', async ({ page }) => {
  await exposeTelegram(page);
  await page.addInitScript(() => localStorage.setItem('alistore.cart.v1', JSON.stringify([{
    id: 'kept',
    sku: 'KEPT-1',
    name: 'Kept cart item',
    price: 100,
    qty: 1,
    stockLimit: 10,
    supplyMode: 'to_order',
    supplyLeadDays: 5,
    orderable: true,
  }])));
  await page.route('**/api/auth/v2/social/telegram', fulfillAuthenticated);
  await page.route('**/api/catalog/products/kept', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      product: {
        id: 'kept',
        sku: 'KEPT-1',
        name: 'Kept cart item',
        price: 100,
        category: 'Тест',
        trackingMode: 'quantity',
        supplyMode: 'to_order',
        supplyLeadDays: 5,
        orderable: true,
        availabilityKind: 'to_order',
        leadTimeDays: 5,
        estimatedDeliveryDate: null,
        attrs: null,
        availableUnits: 0,
        reviewCount: 0,
        avgRating: null,
      },
      variants: [],
      related: [],
    }),
  }));
  await mockMe(page);

  await page.goto('/login?next=/cart');
  await page.getByRole('button', { name: 'Telegram' }).click();

  await expect(page).toHaveURL((url) => url.pathname === '/cart');
  await expect(page.evaluate(() => localStorage.getItem('alistore.cart.v1'))).resolves.toContain('"id":"kept"');
});

test('unknown Telegram identity completes phone-first OTP enrollment without persisting its token', async ({ page }) => {
  await beginEnrollment(page);
  await mockMe(page);
  await page.route('**/api/auth/otp/request', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ challengeId: 'telegram-phone-challenge', devCode: '654321' }),
  }));

  let completePayload: Record<string, string> | null = null;
  await page.route('**/api/auth/v2/social/enrollment/complete', async (route) => {
    completePayload = route.request().postDataJSON() as Record<string, string>;
    await fulfillAuthenticated(route);
  });

  await page.getByLabel('Номер телефона').fill(phone);
  await page.getByRole('button', { name: 'Получить код по SMS' }).click();
  await expect(page.getByLabel('Код из SMS')).toHaveValue('654321');
  await page.getByRole('button', { name: 'Подтвердить номер и войти' }).click();

  await expect(page).toHaveURL((url) => url.pathname === '/cart');
  expect(completePayload).toEqual({
    enrollmentToken,
    phone,
    code: '654321',
    challengeId: 'telegram-phone-challenge',
  });
  expect(await page.evaluate((token) =>
    JSON.stringify(localStorage).includes(token) || JSON.stringify(sessionStorage).includes(token),
  enrollmentToken)).toBe(false);
});

test('wrong enrollment OTP can be retried successfully', async ({ page }) => {
  await beginEnrollment(page);
  await mockMe(page);
  await page.route('**/api/auth/otp/request', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ challengeId: 'retry-challenge', devCode: '654321' }),
  }));
  let attempts = 0;
  await page.route('**/api/auth/v2/social/enrollment/complete', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'otp_invalid', message: 'Неверный код' }),
      });
      return;
    }
    await fulfillAuthenticated(route);
  });

  await page.getByLabel('Номер телефона').fill(phone);
  await page.getByRole('button', { name: 'Получить код по SMS' }).click();
  await page.getByLabel('Код из SMS').fill('000000');
  await page.getByRole('button', { name: 'Подтвердить номер и войти' }).click();
  await expect(page.getByText('Неверный код.')).toBeVisible();

  await page.getByLabel('Код из SMS').fill('654321');
  await page.getByRole('button', { name: 'Подтвердить номер и войти' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/cart');
  expect(attempts).toBe(2);
});

test('enrollment resend observes cooldown and cancel drops the in-memory flow', async ({ page }) => {
  await page.clock.install();
  await beginEnrollment(page);
  let requestCount = 0;
  await page.route('**/api/auth/otp/request', (route) => {
    requestCount += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        challengeId: `challenge-${requestCount}`,
        devCode: requestCount === 1 ? '111111' : '222222',
      }),
    });
  });

  await page.getByLabel('Номер телефона').fill(phone);
  await page.getByRole('button', { name: 'Получить код по SMS' }).click();
  await expect(page.getByRole('button', { name: /Отправить код ещё раз \(60\)/ })).toBeDisabled();
  for (let second = 0; second < 60; second += 1) {
    await page.clock.fastForward(1_000);
    await page.getByRole('button', { name: /Отправить код ещё раз/ }).textContent();
  }
  await page.getByRole('button', { name: 'Отправить код ещё раз' }).click();
  await expect(page.getByLabel('Код из SMS')).toHaveValue('222222');
  expect(requestCount).toBe(2);

  await page.getByRole('button', { name: 'Отменить вход через Telegram' }).click();
  await expect(page.getByText('Подтвердите номер телефона')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Telegram' })).toBeVisible();

  await page.getByRole('button', { name: 'Telegram' }).click();
  await expect(page.getByText('Подтвердите номер телефона')).toBeVisible();
  await page.goto('/');
  await page.goto('/login');
  await expect(page.getByText('Подтвердите номер телефона')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Telegram' })).toBeVisible();
  expect(await page.evaluate((token) =>
    JSON.stringify(localStorage).includes(token) || JSON.stringify(sessionStorage).includes(token),
  enrollmentToken)).toBe(false);
});
