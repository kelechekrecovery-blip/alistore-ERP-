import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedStaffCredentials } from './helpers';

test('Staff app follows the canonical four-section mobile shell', async ({ page, request }) => {
  await resetDb();
  const { staffId, username, password } = await seedStaffCredentials('owner', 'e2e-staff-ui');
  const task = await prisma.staffTask.create({
    data: {
      title: 'Подготовить витрину к открытию',
      description: 'Проверить ценники и выкладку устройств',
      priority: 'high',
      assigneeId: staffId,
      createdById: staffId,
    },
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/staff');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();

  const app = page.getByTestId('staff-app');
  await expect(app).toBeVisible();
  await expect(app).toHaveCSS('width', '402px');
  await expect(app).toHaveCSS('background-color', 'rgb(22, 19, 15)');
  await expect(page.getByText('Сотрудник', { exact: true })).toBeVisible();
  await expect(page.getByTestId('staff-primary-actions').locator('a, button')).toHaveCount(4);
  await expect(page.locator('main > div:last-child button')).toHaveCount(4);

  await page.getByRole('button', { name: 'Задачи и KPI' }).click();
  await expect(page.getByRole('heading', { name: 'Задачи и KPI' })).toBeVisible();
  await expect(page.getByText(task.title)).toBeVisible();
  await page.getByRole('button', { name: `Начать: ${task.title}` }).click();
  await expect(page.getByRole('button', { name: `Завершить: ${task.title}` })).toBeVisible();
  await page.getByRole('button', { name: `Завершить: ${task.title}` }).click();
  await expect(page.getByRole('button', { name: `Выполнено: ${task.title}` })).toBeDisabled();
  await expect.poll(async () => (await prisma.staffTask.findUnique({ where: { id: task.id } }))?.status)
    .toBe('completed');
  await page.getByRole('button', { name: 'Назад на главную' }).click();
  await expect(page.getByText('ЗАДАЧА ОТ AI')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
});
