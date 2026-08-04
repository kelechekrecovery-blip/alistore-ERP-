import { expect, test } from '@playwright/test';
import { sign } from 'jsonwebtoken';
import { prisma, resetDb } from './helpers';

/**
 * Email is a second login channel into the same account — Customer.phone
 * stays the unique key (`apps/api/src/auth/auth.service.ts`). A customer
 * attaches an address from their own account (proving mailbox ownership via
 * a code), then can use that address to sign back in instead of the phone.
 */
test('customer attaches an email in settings, then signs back in with it', async ({ page }) => {
  await resetDb();
  const phone = '+996700950002';
  const customer = await prisma.customer.create({ data: { phone, name: 'Почтовый клиент' } });
  const email = `owner-${Date.now()}@example.com`;

  const tokens = {
    accessToken: sign(
      { sub: customer.id, phone: customer.phone, typ: 'customer' },
      'dev-secret-alistore-local',
      { expiresIn: '1h' },
    ),
    refreshToken: 'email-attach-test-refresh',
  };
  await page.addInitScript((auth) => {
    localStorage.setItem('alistore.auth.v1', JSON.stringify(auth));
  }, tokens);

  await page.goto('/account/settings');
  await expect(page.getByText('не привязан')).toBeVisible();

  await page.getByRole('button', { name: 'Привязать почту' }).click();
  await page.getByLabel('Email для привязки').fill(email);
  await page.getByRole('button', { name: 'Получить код' }).click();

  const attachDevCode = await page.getByText(/dev-код:/).textContent();
  const attachCode = attachDevCode?.match(/\d{6}/)?.[0];
  expect(attachCode).toMatch(/^\d{6}$/);

  await expect(page.getByLabel('Код подтверждения email')).toHaveValue(attachCode as string);
  const attachConfirmRequest = page.waitForRequest((request) =>
    request.url().endsWith('/auth/email/attach/confirm') && request.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Подтвердить' }).click();
  await expect(attachConfirmRequest.then((request) => request.postDataJSON())).resolves.toMatchObject({
    email,
    code: attachCode,
    challengeId: expect.any(String),
  });
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  expect((await prisma.customer.findUnique({ where: { id: customer.id } }))?.email).toBe(email);

  // Начинаем новую (анонимную) сессию и входим тем же адресом по почте.
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.goto('/login');
  await page.getByTestId('login-channel-email').click();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Получить код на почту' }).click();

  const loginDevCode = await page.getByText(/dev-код:/).textContent();
  const loginCode = loginDevCode?.match(/\d{6}/)?.[0];
  expect(loginCode).toMatch(/^\d{6}$/);
  await expect(page.locator('input[inputmode="numeric"]')).toHaveValue(loginCode as string);
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page).toHaveURL(/\/account$/);
  await page.goto('/account/settings');
  await expect(page.getByText(phone, { exact: true })).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
});

test('an unattached email cannot be used to sign in', async ({ page }) => {
  await resetDb();
  await page.goto('/login');
  await page.getByTestId('login-channel-email').click();
  await page.getByLabel('Email').fill(`nobody-${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Получить код на почту' }).click();
  // Неизвестный адрес не должен выдавать dev-код — иначе это оракул наличия аккаунта.
  await expect(page.getByText(/dev-код:/)).not.toBeVisible();
  await page.locator('input[inputmode="numeric"]').fill('000000');
  await page.getByRole('button', { name: 'Войти' }).click();
  // Unknown addresses receive a deliberately indistinguishable challenge row;
  // with a supplied code the server therefore returns the generic invalid-code
  // response rather than revealing whether the address exists.
  await expect(page.getByText('Неверный код.')).toBeVisible();
});

test('login presents one phone sign-in/create flow and only available providers', async ({ page }) => {
  await page.goto('/login?next=/cart');

  await expect(page.getByRole('heading', { name: 'Войти или создать аккаунт' })).toBeVisible();
  await expect(page.getByText(/Если номер ещё не зарегистрирован, после проверки кода мы создадим аккаунт/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Восстановить' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apple' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Telegram' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Продолжить как гость/ })).toBeVisible();

  await page.getByTestId('login-channel-email').click();
  await expect(page.getByText(/по привязанной почте/)).toBeVisible();
  await expect(page.getByTestId('login-channel-email')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('login-channel-phone')).toHaveAttribute('aria-pressed', 'false');
});

test('a first verified phone creates an account and keeps the safe next redirect', async ({ page }) => {
  await resetDb();
  const phone = `+996700${String(Date.now()).slice(-6)}`;

  await page.goto('/login?next=/cart');
  await page.getByLabel('Номер телефона').fill(phone);
  await page.getByRole('button', { name: 'Получить код по SMS' }).click();

  const devCode = await page.getByText(/dev-код:/).textContent();
  const code = devCode?.match(/\d{6}/)?.[0];
  expect(code).toMatch(/^\d{6}$/);
  await expect(page.getByLabel('Код из SMS')).toHaveValue(code as string);
  await expect(page.getByRole('button', { name: /Отправить код ещё раз \(60\)/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Войти или создать аккаунт' }).click();

  await expect(page).toHaveURL((url) => url.pathname === '/cart');
  await expect(prisma.customer.findUnique({ where: { phone } })).resolves.not.toBeNull();
});

test('an existing phone uses the same flow without creating a duplicate account', async ({ page }) => {
  await resetDb();
  const phone = '+996700950099';
  const existing = await prisma.customer.create({ data: { phone, name: 'Существующий клиент' } });

  await page.goto('/login?next=/account');
  await page.getByLabel('Номер телефона').fill(phone);
  await page.getByRole('button', { name: 'Получить код по SMS' }).click();
  const devCode = await page.getByText(/dev-код:/).textContent();
  const code = devCode?.match(/\d{6}/)?.[0];
  expect(code).toMatch(/^\d{6}$/);
  await page.getByRole('button', { name: 'Войти или создать аккаунт' }).click();

  await expect(page).toHaveURL((url) => url.pathname === '/account');
  await expect(prisma.customer.count({ where: { phone } })).resolves.toBe(1);
  await expect(prisma.customer.findUnique({ where: { phone } })).resolves.toMatchObject({ id: existing.id });
});

test('failed web logout still clears local auth and reload cannot restore the fixture', async ({ page }) => {
  await resetDb();
  const phone = '+996700950088';
  const customer = await prisma.customer.create({ data: { phone, name: 'Logout retry' } });
  const accessToken = sign(
    { sub: customer.id, phone, typ: 'customer' },
    'dev-secret-alistore-local',
    { expiresIn: '1h' },
  );
  await page.addInitScript((token) => {
    localStorage.setItem('alistore.auth.v1', JSON.stringify({ accessToken: token }));
  }, accessToken);
  await page.route('**/api/auth/logout', (route) => route.abort('failed'));

  await page.goto('/account/settings');
  await expect(page.getByText(phone, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Выйти из аккаунта' }).click();

  await expect(page).toHaveURL((url) => url.pathname === '/account/settings');
  await expect(page.getByText('Не удалось выйти из аккаунта. Проверьте соединение и попробуйте снова.')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Войдите по OTP, чтобы изменить профиль.')).toBeVisible();
  await expect(page.getByText(phone, { exact: true })).toHaveCount(0);
});
