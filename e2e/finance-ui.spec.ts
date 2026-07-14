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

  const period = new Date().toISOString().slice(0, 7);
  const planning = page.locator('section[aria-labelledby="finance-plan-title"]');
  await planning.getByLabel('Период бюджета').fill(period);
  await planning.getByLabel('Точка бюджета').fill('BISHKEK-1');
  await planning.getByLabel('Категория бюджета').selectOption('rent');
  await planning.getByLabel('Сумма бюджета').fill('100000');
  await planning.getByRole('button', { name: 'Установить бюджет' }).click();
  await expect(planning.getByTestId('finance-plan')).toContainText(/100.000/);

  await page.getByLabel('Категория расхода').selectOption('rent');
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
  await expect(planning.getByTestId('finance-actual')).toContainText(/85.000/);
  await expect(planning.getByTestId('finance-row-rent')).toContainText('85%');

  const expense = await prisma.expense.findFirstOrThrow();
  expect(expense).toMatchObject({ status: 'paid', amount: 85000, point: 'BISHKEK-1' });
  const budget = await prisma.financeBudget.findFirstOrThrow();
  expect(budget).toMatchObject({ period, category: 'rent', point: 'BISHKEK-1', amount: 100000, version: 1 });
  await expect.poll(() => prisma.auditEvent.count({ where: { refs: { has: expense.id } } })).toBe(3);
  await expect.poll(() => prisma.auditEvent.count({ where: { refs: { has: budget.id } } })).toBe(1);
});
