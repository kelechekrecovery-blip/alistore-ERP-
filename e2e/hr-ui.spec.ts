import { expect, test } from '@playwright/test';
import { postJson, prisma, resetDb, seedStaffCredentials } from './helpers';

test.afterEach(async () => resetDb());

test('owner schedules staff, approves absence and sees attendance in HR timesheet', async ({ page, request }) => {
  await resetDb();
  const owner = await seedStaffCredentials('owner', 'e2e-hr-owner');
  const seller = await seedStaffCredentials('seller', 'e2e-hr-seller');
  const now = new Date();
  const day = now.getUTCDay() || 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 1));
  const weekStart = monday.toISOString().slice(0, 10);
  const tuesday = new Date(monday.getTime() + 86_400_000).toISOString().slice(0, 10);

  await postJson(request, '/hr/me/absences', {
    type: 'annual_leave', startsOn: tuesday, endsOn: tuesday, reason: 'Семейный день',
  }, seller.accessToken, { 'idempotency-key': `e2e-hr-absence-${Date.now()}` });

  await page.goto('/erp');
  await page.getByPlaceholder('username').fill(owner.username);
  await page.getByPlaceholder('password').fill(owner.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: /HR · Смены/ }).click();
  await expect(page.getByTestId('hr-view')).toBeVisible();
  await page.getByLabel('Неделя HR').fill(weekStart);
  await page.getByLabel('Сотрудник HR').selectOption(seller.staffId);
  await page.getByLabel('Дата смены').fill(weekStart);
  await page.getByLabel('Начало смены').fill('09:00');
  await page.getByLabel('Конец смены').fill('21:00');
  await page.getByRole('button', { name: 'Назначить' }).click();
  await expect(page.getByTestId(`hr-row-${seller.staffId}`)).toContainText('09:00–21:00');

  await page.getByRole('tab', { name: 'Профиль' }).click();
  await page.getByLabel('Профиль сотрудника').selectOption(seller.staffId);
  await expect(page.getByText('Семейный день')).toBeVisible();
  await page.getByRole('button', { name: 'Одобрить' }).click();
  await page.getByRole('tab', { name: 'График смен' }).click();
  await expect(page.getByTestId(`hr-row-${seller.staffId}`)).toContainText('Отпуск');

  const schedule = await prisma.hrSchedule.findFirstOrThrow({ where: { staffId: seller.staffId, shiftDate: monday } });
  await postJson(request, '/hr/me/attendance/open', { scheduleId: schedule.id }, seller.accessToken, { 'idempotency-key': `e2e-hr-open-${Date.now()}` });
  await postJson(request, '/hr/me/attendance/close', { scheduleId: schedule.id }, seller.accessToken, { 'idempotency-key': `e2e-hr-close-${Date.now()}` });
  await prisma.hrAttendance.update({ where: { scheduleId: schedule.id }, data: {
    checkedInAt: new Date(schedule.startsAt.getTime() + 12 * 60_000),
    checkedOutAt: new Date(schedule.endsAt.getTime() + 25 * 60_000),
  } });

  await page.getByRole('button', { name: /Финансы/ }).click();
  await page.getByRole('button', { name: /HR · Смены/ }).click();
  await page.getByRole('tab', { name: 'Табель' }).click();
  await expect(page.getByTestId(`timesheet-${seller.staffId}`)).toContainText('12м');
  await expect(page.getByTestId(`timesheet-${seller.staffId}`)).toContainText('+25м');
  await expect(page.getByTestId(`timesheet-${seller.staffId}`)).toContainText('12ч 13м');

  expect(await prisma.auditEvent.count({ where: { type: { startsWith: 'hr.' }, refs: { has: seller.staffId } } })).toBe(5);
});
