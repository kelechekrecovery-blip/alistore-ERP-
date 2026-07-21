import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedStaffCredentials } from './helpers';

test('Staff app follows the canonical four-section mobile shell', async ({ page }) => {
  await resetDb();
  const session = await seedStaffCredentials('owner', 'e2e-staff-ui');
  const { staffId } = session;
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
  await page.addInitScript((auth) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(auth));
  }, { accessToken: session.accessToken, staffId: session.staffId, username: session.username, role: 'owner', totpEnabled: false });
  await page.goto('/staff');

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

test('cashier closes a shift with a blind physical count before seeing the variance', async ({ page }) => {
  await resetDb();
  const session = await seedStaffCredentials('cashier', 'e2e-staff-blind-count');
  const shift = await prisma.cashShift.create({
    data: { staffId: session.staffId, point: 'BISHKEK-1', openCash: 5_000 },
  });
  await prisma.payment.create({
    data: { shiftId: shift.id, amount: 10_000, method: 'cash', status: 'received' },
  });

  await page.addInitScript((auth) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(auth));
  }, {
    accessToken: session.accessToken,
    staffId: session.staffId,
    username: session.username,
    role: 'cashier',
    totpEnabled: false,
  });
  await page.goto('/staff');

  await expect(page.getByText('Ожидаемая сумма скрыта до отправки. Пересчитайте наличные самостоятельно.')).toBeVisible();
  await expect(page.getByLabel('Фактически пересчитано в кассе')).toHaveValue('');
  await expect(page.getByText('15 000 сом')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Закрыть' })).toBeDisabled();
  await page.getByLabel('Фактически пересчитано в кассе').fill('14000');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Закрыть' }).click();

  const reconciliation = page.getByTestId('staff-last-reconciliation');
  await expect(reconciliation).toContainText('14 000 сом');
  await expect(reconciliation).toContainText('15 000 сом');
  await expect(reconciliation).toContainText('-1 000 сом');
  await expect.poll(async () => (await prisma.cashShift.findUniqueOrThrow({ where: { id: shift.id } })).closedAt)
    .not.toBeNull();
  const closed = await prisma.cashShift.findUniqueOrThrow({ where: { id: shift.id } });
  expect(closed).toMatchObject({
    closeCash: 14_000,
    diff: -1_000,
    closeReason: 'Слепой пересчёт кассы',
  });
});
