import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedStaffCredentials } from './helpers';

test.afterEach(async () => resetDb());

test('ERP completes evidence-backed four-eyes quarantine disposition', async ({ page }) => {
  await resetDb();
  const diagnostician = await seedStaffCredentials('owner', 'e2e-quarantine-diagnostician');
  const disposer = await seedStaffCredentials('owner', 'e2e-quarantine-disposer');
  const product = await prisma.product.create({
    data: {
      sku: `QUARANTINE-UI-${Date.now()}`,
      name: 'iPhone 15 Pro возврат',
      price: 120_000,
      cost: 85_000,
      category: 'phones',
      attrs: {},
    },
  });
  const unit = await prisma.deviceUnit.create({
    data: {
      imei: `QUARANTINE-UI-${Date.now()}-IMEI`,
      productId: product.id,
      status: 'returned',
      location: 'RETURNS-BISHKEK',
      acquisitionCost: 85_000,
    },
  });
  const customer = await prisma.customer.create({
    data: { phone: `+996700${Date.now().toString().slice(-6)}`, name: 'Клиент возврата' },
  });
  const order = await prisma.order.create({
    data: { customerId: customer.id, channel: 'web', total: 120_000, status: 'paid' },
  });
  const ret = await prisma.return.create({
    data: { orderId: order.id, reason: 'Возврат клиента: проверка пломб', status: 'reconciled' },
  });
  const quarantine = await prisma.inventoryQuarantineCase.create({
    data: {
      unitId: unit.id,
      returnId: ret.id,
      sourceType: 'return',
      reason: 'Возврат клиента: проверка пломб',
      unitCost: 85_000,
      createdBy: diagnostician.staffId,
    },
  });
  const png = readFileSync('node_modules/@jest/reporters/assets/jest_logo.png');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/erp');
  await page.evaluate((session) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(session));
  }, staffSession(diagnostician));
  await page.reload();
  await page.getByRole('button', { name: /Склад/ }).click();

  const row = page.getByTestId(`quarantine-${quarantine.id}`);
  await expect(row).toContainText('iPhone 15 Pro возврат');
  await row.getByLabel(`Комментарий ${unit.imei}`).fill('Пломбы целы, устройство исправно');
  await row.locator('input[type="file"]').setInputFiles({ name: 'diagnosis.png', mimeType: 'image/png', buffer: png });
  await row.getByRole('button', { name: 'Зафиксировать' }).click();
  await expect(row).toContainText('Можно вернуть в продажу');
  await expect(row).toContainText(`Диагност: ${diagnostician.staffId}`);

  await page.evaluate((session) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(session));
  }, staffSession(disposer));
  await page.reload();
  await page.getByRole('button', { name: /Склад/ }).click();
  const secondEyeRow = page.getByTestId(`quarantine-${quarantine.id}`);
  await secondEyeRow.getByRole('button', { name: 'Вернуть в продажу' }).click();
  await expect(secondEyeRow).toContainText('Решение выполнено: возвращено в продажу');
  await expect(secondEyeRow).toContainText(`Исполнитель: ${disposer.staffId}`);

  expect(await prisma.deviceUnit.findUniqueOrThrow({ where: { id: unit.id } })).toMatchObject({ status: 'in_stock' });
  expect(await prisma.inventoryQuarantineCase.findUniqueOrThrow({ where: { id: quarantine.id } })).toMatchObject({
    status: 'disposed',
    diagnosis: 'resellable',
    disposition: 'restock',
    diagnosedBy: diagnostician.staffId,
    disposedBy: disposer.staffId,
  });
});

function staffSession(staff: Awaited<ReturnType<typeof seedStaffCredentials>>) {
  return {
    accessToken: staff.accessToken,
    staffId: staff.staffId,
    username: staff.username,
    role: 'owner',
    totpEnabled: false,
  };
}
