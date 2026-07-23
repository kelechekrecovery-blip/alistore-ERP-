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
  await page.getByRole('button', { name: 'Подтвердить' }).click();
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
  await expect(page.getByText('Код не найден или истёк. Запросите новый.')).toBeVisible();
});
