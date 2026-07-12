import { expect, test } from '@playwright/test';
import * as argon2 from 'argon2';
import { prisma, resetDb } from './helpers';

test.afterEach(async () => resetDb());

test('owner submits, approves and pays an operating expense in ERP', async ({ page }) => {
  await resetDb();
  const username = `e2e-finance-${Date.now().toString(36)}`;
  const password = 'pass-e2e';
  await prisma.staffUser.create({
    data: { username, passwordHash: await argon2.hash(password), role: 'owner' },
  });

  await page.goto('/erp');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: /Финансы/ }).click();

  await page.getByPlaceholder('Назначение').fill('Аренда склада за июль');
  await page.getByPlaceholder('Сумма, сом').fill('85000');
  await page.getByPlaceholder('Точка').fill('BISHKEK-1');
  await page.getByRole('button', { name: 'Отправить на согласование' }).click();
  await expect(page.getByText('Аренда склада за июль')).toBeVisible();
  await expect(page.getByText(/На согласовании/)).toBeVisible();

  await page.getByRole('button', { name: 'Согласовать' }).click();
  await expect(page.getByText(/Согласовано/)).toBeVisible();
  await page.getByRole('button', { name: 'Выплатить' }).click();
  await expect(page.getByText(/Выплачено/)).toBeVisible();

  const expense = await prisma.expense.findFirstOrThrow();
  expect(expense).toMatchObject({ status: 'paid', amount: 85000, point: 'BISHKEK-1' });
  await expect.poll(() => prisma.auditEvent.count({ where: { refs: { has: expense.id } } })).toBe(3);
});
