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
  const paymentKeys: string[] = [];
  await page.route('**/api/finance/expenses/*/pay', async (route) => {
    paymentKeys.push((route.request().postDataJSON() as { idempotencyKey: string }).idempotencyKey);
    if (paymentKeys.length === 1) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await page.getByLabel('Источник выплаты Аренда склада за июль').selectOption('1010');
  await page.getByLabel('Платёжный референс Аренда склада за июль').fill('E2E-BANK-001');
  await page.getByRole('button', { name: 'Провести выплату' }).click();
  await expect.poll(() => paymentKeys.length).toBe(1);
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).find((key) => key.startsWith('alistore:finance:expense-payment:')) ?? null)).not.toBeNull();

  await page.reload();
  await page.getByRole('button', { name: /Финансы/ }).click();
  await planning.getByLabel('Точка бюджета').fill('BISHKEK-1');
  await page.getByLabel('Источник выплаты Аренда склада за июль').selectOption('1010');
  await page.getByLabel('Платёжный референс Аренда склада за июль').fill('E2E-BANK-001');
  await page.getByRole('button', { name: 'Провести выплату' }).click();
  await expect(page.getByText(/Выплачено/)).toBeVisible();
  await expect(page.getByText('E2E-BANK-001')).toBeVisible();
  expect(paymentKeys).toHaveLength(2);
  expect(paymentKeys[1]).toBe(paymentKeys[0]);
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('alistore:finance:expense-payment:')))).toBe(false);
  await expect(planning.getByTestId('finance-actual')).toContainText(/85.000/);
  await expect(planning.getByTestId('finance-row-rent')).toContainText('85%');

  const expense = await prisma.expense.findFirstOrThrow();
  expect(expense).toMatchObject({
    status: 'paid',
    amount: 85000,
    point: 'BISHKEK-1',
    paymentAccountCode: '1010',
    paymentReference: 'E2E-BANK-001',
  });
  const journalEntry = await prisma.accountingJournalEntry.findFirstOrThrow({
    where: { sourceType: 'expense.payment', sourceRef: expense.id },
    include: { lines: true },
  });
  expect(journalEntry.lines.reduce((sum, line) => sum + line.debit, 0)).toBe(85000);
  expect(journalEntry.lines.reduce((sum, line) => sum + line.credit, 0)).toBe(85000);
  const budget = await prisma.financeBudget.findFirstOrThrow();
  expect(budget).toMatchObject({ period, category: 'rent', point: 'BISHKEK-1', amount: 100000, version: 1 });
  await expect.poll(() => prisma.auditEvent.count({ where: { refs: { has: expense.id } } })).toBe(4);
  await expect.poll(() => prisma.auditEvent.count({ where: { refs: { has: budget.id } } })).toBe(1);
});

test('owner creates and closes an authoritative provider settlement in ERP', async ({ page }) => {
  await resetDb();
  const username = `e2e-settlement-${Date.now().toString(36)}`;
  const password = 'pass-e2e';
  await prisma.staffUser.create({ data: { username, passwordHash: await argon2.hash(password), role: 'owner' } });
  const customer = await prisma.customer.create({ data: { phone: `+996700${Date.now().toString().slice(-6)}`, name: 'Finance UI' } });
  const order = await prisma.order.create({ data: { customerId: customer.id, status: 'paid', channel: 'web', total: 12_500, storePointCode: 'center', storePointName: 'AliStore Центр' } });
  const payment = await prisma.payment.create({ data: { orderId: order.id, amount: 12_500, method: 'qr_mbank', status: 'received', txnId: `e2e-settlement-${Date.now()}` } });

  await page.goto('/erp');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: /Финансы/ }).click();

  const workspace = page.locator('section[aria-labelledby="settlements-title"]');
  await workspace.getByRole('button', { name: 'Найти источники' }).click();
  await expect(workspace.getByText(/Платёж qr_mbank/)).toBeVisible();
  await expect(workspace.getByText(/12.500/).first()).toBeVisible();
  let droppedCreateResponse = false;
  await page.route('**/api/finance/settlements', async (route) => {
    if (route.request().method() === 'POST' && !droppedCreateResponse) {
      droppedCreateResponse = true;
      await route.fetch();
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await workspace.getByRole('button', { name: 'Создать сверку' }).click();
  await expect(workspace.getByRole('status')).toBeVisible();
  await workspace.getByRole('button', { name: 'Создать сверку' }).click();
  const run = workspace.getByTestId('finance-settlement-run').first();
  await expect(run).toContainText('Сходится');
  expect(await prisma.financeSettlementRun.count()).toBe(1);
  await run.getByRole('button', { name: 'Провести и закрыть' }).click();
  await expect(run).toContainText('Закрыта');

  expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('reconciled');
  expect(await prisma.auditEvent.count({ where: { type: 'payment.reconciled', refs: { has: payment.id } } })).toBe(1);
});
