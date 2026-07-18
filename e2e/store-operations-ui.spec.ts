import { expect, test } from '@playwright/test';
import * as argon2 from 'argon2';
import { prisma, resetDb } from './helpers';

test.afterEach(async () => resetDb());

test('owner opens and closes store operations checklists and resolves an incident', async ({ page }) => {
  await resetDb();
  const username = `e2e-store-ops-${Date.now().toString(36)}`;
  const password = 'pass-e2e';
  const businessDate = new Date().toISOString().slice(0, 10);

  await prisma.staffUser.create({
    data: { username, passwordHash: await argon2.hash(password), role: 'owner' },
  });

  await page.goto('/erp');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: /Операции точки/ }).click();

  const view = page.getByTestId('store-operations-view');
  await expect(view.getByRole('heading', { name: 'Операционка точки' }).first()).toBeVisible();
  await view.getByLabel('Дата операций точки').fill(businessDate);
  await view.getByLabel('Код операционной точки').fill('BISHKEK-1');

  await view.getByRole('button', { name: 'Открыть чек-лист' }).first().click();
  await view.getByRole('button', { name: 'Открыть чек-лист' }).first().click();
  await expect(view.getByRole('heading', { name: 'Открытие точки' })).toBeVisible();
  await expect(view.getByRole('heading', { name: 'Закрытие точки' })).toBeVisible();
  await expect(view.getByText('Стартовая касса пересчитана')).toBeVisible();
  await expect(view.getByText('Терминальная смена закрыта')).toBeVisible();

  const openingItems = view.locator('section[aria-labelledby="store-opening-title"] button');
  const closingItems = view.locator('section[aria-labelledby="store-closing-title"] button');
  expect(await openingItems.count()).toBe(7);
  expect(await closingItems.count()).toBe(7);
  for (let index = 0; index < 6; index += 1) {
    await openingItems.nth(index).click();
    await closingItems.nth(index).click();
  }
  await view.getByRole('button', { name: 'Завершить чек-лист' }).first().click();
  await view.getByRole('button', { name: 'Завершить чек-лист' }).first().click();
  await expect(view.getByText('Завершён').first()).toBeVisible();
  await expect(view.getByText('Завершён').last()).toBeVisible();

  await view.getByLabel('Заголовок инцидента').fill('Повреждена витринная полка');
  await view.getByLabel('Описание инцидента').fill('Зафиксирована трещина перед открытием точки');
  await view.getByRole('button', { name: 'Добавить' }).click();
  await expect(view.getByText('Повреждена витринная полка')).toBeVisible();

  await view.getByRole('button', { name: 'Закрыть' }).click();
  await view.getByLabel('Решение инцидента Повреждена витринная полка').fill('Полка заменена, фото добавлено в Evidence Vault');
  await view.getByRole('button', { name: 'Сохранить' }).click();
  await expect(view.getByText('Решение: Полка заменена, фото добавлено в Evidence Vault')).toBeVisible();
  await expect(view.getByText('закрыт', { exact: true })).toBeVisible();

  const opening = await prisma.storeOperationChecklist.findFirstOrThrow({ where: { type: 'opening' } });
  const closing = await prisma.storeOperationChecklist.findFirstOrThrow({ where: { type: 'closing' } });
  const incident = await prisma.storeIncident.findFirstOrThrow();
  expect(opening.status).toBe('completed');
  expect(closing.status).toBe('completed');
  expect(incident.status).toBe('resolved');
  expect(await prisma.auditEvent.count({ where: { refs: { has: opening.id } } })).toBe(8);
  expect(await prisma.auditEvent.count({ where: { refs: { has: closing.id } } })).toBe(8);
  expect(await prisma.auditEvent.count({ where: { refs: { has: incident.id } } })).toBe(2);
});
