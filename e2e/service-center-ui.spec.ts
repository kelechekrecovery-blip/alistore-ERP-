import { expect, test } from '@playwright/test';
import { sign } from 'jsonwebtoken';
import { readFileSync } from 'node:fs';
import { prisma, resetDb, seedStaffCredentials } from './helpers';

test.afterEach(async () => resetDb());

test('ERP diagnoses a device and the customer approves the estimate on the site', async ({ page }) => {
  await resetDb();
  const owner = await seedStaffCredentials('owner', 'e2e-service-owner');
  const phone = '+996700950001';
  const customer = await prisma.customer.create({ data: { phone, name: 'Service E2E Customer' } });
  const product = await prisma.product.create({
    data: { sku: `SERVICE-UI-${Date.now()}`, name: 'iPhone 15 Pro Service', price: 120_000, cost: 90_000, category: 'phones', attrs: {} },
  });
  const order = await prisma.order.create({ data: { customerId: customer.id, channel: 'web', status: 'paid', total: product.price } });
  const imei = `SERVICE-UI-${Date.now()}-IMEI`;
  await prisma.deviceUnit.create({ data: { imei, productId: product.id, orderId: order.id, status: 'sold', location: 'BISHKEK-1' } });
  const warrantyCase = await prisma.warrantyCase.create({
    data: { imei, customerId: customer.id, problem: 'Быстро разряжается', sla: new Date(Date.now() + 7 * 86_400_000) },
  });

  await page.addInitScript((session) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(session));
  }, { accessToken: owner.accessToken, staffId: owner.staffId, username: owner.username, role: 'owner', totpEnabled: false });
  await page.goto('/erp');
  await page.getByRole('button', { name: /Сервис-центр/ }).click();
  const row = page.getByTestId(`service-case-${warrantyCase.id}`);
  await expect(row).toContainText('iPhone 15 Pro Service');
  await row.getByRole('button', { name: 'Принять' }).click();
  await expect(row).toContainText('Принято');
  await row.getByRole('button', { name: 'Диагностика' }).click();
  await page.getByLabel('Заключение диагностики').fill('Износ аккумулятора 71%');
  await page.getByLabel('Сумма сметы').fill('4500');
  await page.getByLabel('Стоимость диагностики').fill('500');
  await page.getByRole('button', { name: 'Сохранить смету' }).click();
  await expect(row).toContainText('Смета у клиента');
  await expect(row).toContainText('4 500');

  const tokens = {
    accessToken: sign({ sub: customer.id, phone, typ: 'customer' }, 'dev-secret-alistore-local', { expiresIn: '1h' }),
    refreshToken: 'service-center-e2e-refresh',
  };
  await page.evaluate((auth) => localStorage.setItem('alistore.auth.v1', JSON.stringify(auth)), tokens);
  await page.goto('/account/devices');
  const estimate = page.locator('[data-testid^="service-estimate-"]');
  await expect(estimate).toContainText('Износ аккумулятора 71%');
  await expect(estimate).toContainText('4 500');
  await estimate.getByRole('button', { name: 'Подтвердить смету' }).click();
  await expect(estimate).toContainText('Смета подтверждена · устройство в работе');

  const partProduct = await prisma.product.create({
    data: { sku: `SERVICE-PART-UI-${Date.now()}`, name: 'Аккумулятор сервисный', price: 3000, cost: 1800, category: 'parts', trackingMode: 'quantity', attrs: {} },
  });
  await prisma.inventoryBalance.create({ data: { productId: partProduct.id, location: 'BISHKEK-1', onHand: 2 } });
  await page.goto('/erp');
  await page.getByRole('button', { name: /Сервис-центр/ }).click();
  const approvedRow = page.getByTestId(`service-case-${warrantyCase.id}`);
  await approvedRow.getByRole('button', { name: 'Заказ-наряд' }).click();
  await page.getByLabel('ID запчасти').fill(partProduct.id);
  await page.getByRole('button', { name: 'Резерв' }).click();
  await expect(page.getByRole('dialog', { name: 'Заказ-наряд ремонта' })).toContainText('Аккумулятор сервисный');
  await page.getByRole('button', { name: 'Начать ремонт' }).click();
  await page.getByRole('button', { name: 'Установить' }).click();
  await page.getByLabel('Результат ремонта').fill('Аккумулятор заменён, контроль заряда пройден');
  await page.getByRole('button', { name: 'Завершить ремонт' }).click();
  await page.getByRole('button', { name: /Выдать и закрыть/ }).click();
  await expect(page.getByRole('dialog', { name: 'Заказ-наряд ремонта' })).toContainText('Закрыто');

  const workOrder = await prisma.serviceWorkOrder.findUniqueOrThrow({ where: { warrantyCaseId: warrantyCase.id } });
  expect(workOrder).toMatchObject({ diagnosticSummary: 'Износ аккумулятора 71%', estimateAmount: 4500, diagnosticFee: 500, estimateApprovedBy: customer.id, completionSummary: 'Аккумулятор заменён, контроль заряда пройден' });
  expect(workOrder.estimateApprovedAt).not.toBeNull();
  expect(workOrder.repairWarrantyUntil).not.toBeNull();
  await expect(prisma.warrantyCase.findUniqueOrThrow({ where: { id: warrantyCase.id } })).resolves.toMatchObject({ status: 'closed' });
  expect(await prisma.auditEvent.count({ where: { type: { startsWith: 'service.' }, refs: { has: workOrder.id } } })).toBe(8);
});

test('ERP accepts a third-party paid repair and the customer approves its estimate', async ({ page }) => {
  await resetDb();
  const owner = await seedStaffCredentials('owner', 'e2e-paid-service-owner');
  const phone = '+996700950002';
  const serial = `PAID-UI-${Date.now()}-SN`;

  await page.addInitScript((session) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(session));
  }, { accessToken: owner.accessToken, staffId: owner.staffId, username: owner.username, role: 'owner', totpEnabled: false });
  await page.goto('/erp');
  await page.getByRole('button', { name: /Сервис-центр/ }).click();
  await page.getByRole('tab', { name: 'Платный ремонт' }).click();
  await page.getByLabel('Телефон клиента').fill(phone);
  await page.getByLabel('Имя клиента').fill('Paid Service E2E');
  await page.getByLabel('Устройство').fill('Xiaomi 13 Pro');
  await page.getByLabel('IMEI / серийный номер').fill(serial);
  await page.getByLabel('Проблема платного ремонта').fill('Разбит дисплей');
  await page.getByRole('button', { name: 'Принять на диагностику' }).click();
  await expect(page.getByRole('status')).toContainText('Устройство принято');

  const paidRepair = page.locator('[data-testid^="paid-repair-"]').filter({ hasText: serial });
  await expect(paidRepair).toContainText('Xiaomi 13 Pro');
  await paidRepair.getByRole('button', { name: 'Диагностика' }).click();
  await page.getByLabel('Заключение диагностики').fill('Требуется модуль дисплея');
  await page.getByLabel('Сумма сметы').fill('6500');
  await page.getByLabel('Стоимость диагностики').fill('500');
  await page.getByRole('button', { name: 'Сохранить смету' }).click();
  await expect(paidRepair).toContainText('Смета у клиента');
  await expect(paidRepair).toContainText('6 500');

  const customer = await prisma.customer.findUniqueOrThrow({ where: { phone } });
  const tokens = {
    accessToken: sign({ sub: customer.id, phone, typ: 'customer' }, 'dev-secret-alistore-local', { expiresIn: '1h' }),
    refreshToken: 'paid-service-center-e2e-refresh',
  };
  await page.evaluate((auth) => localStorage.setItem('alistore.auth.v1', JSON.stringify(auth)), tokens);
  await page.goto('/account/devices');
  const accountRepair = page.locator('[data-testid^="paid-service-account-"]').filter({ hasText: serial });
  await expect(accountRepair).toContainText('Xiaomi 13 Pro');
  const estimate = accountRepair.locator('[data-testid^="service-estimate-"]');
  await expect(estimate).toContainText('Требуется модуль дисплея');
  await estimate.getByRole('button', { name: 'Подтвердить смету' }).click();
  await expect(estimate).toContainText('Смета подтверждена · оплатите на кассе');

  const warrantyCase = await prisma.warrantyCase.findFirstOrThrow({ where: { customerId: customer.id, imei: serial } });
  expect(warrantyCase).toMatchObject({ serviceType: 'paid', deviceName: 'Xiaomi 13 Pro', status: 'approved' });
  expect(await prisma.deviceUnit.count({ where: { imei: serial } })).toBe(0);
  const workOrder = await prisma.serviceWorkOrder.findUniqueOrThrow({ where: { warrantyCaseId: warrantyCase.id } });
  expect(workOrder).toMatchObject({ estimateAmount: 6500, diagnosticFee: 500, estimateApprovedBy: customer.id });
  const shift = await prisma.cashShift.create({ data: { staffId: owner.staffId, point: 'BISHKEK-1', openCash: 1000, openIdempotencyKey: `paid-ui-shift-${Date.now()}` } });

  await page.goto(`/pos?serviceWorkOrderId=${encodeURIComponent(workOrder.id)}`);
  await expect(page.getByTestId('service-payment-ticket')).toContainText('Xiaomi 13 Pro');
  await expect(page.getByTestId('service-payment-ticket')).toContainText('6 500');
  await page.getByTestId('service-payment-open').click();
  await page.getByRole('button', { name: 'Split' }).click();
  await page.getByTestId('split-payment-amount-0').fill('2500');
  await page.getByTestId('split-payment-amount-1').fill('4000');
  await page.getByTestId('service-payment-submit').click();
  await expect(page.getByTestId('service-payment-success')).toContainText('6 500');

  const payments = await prisma.payment.findMany({ where: { serviceWorkOrderId: workOrder.id }, orderBy: { amount: 'asc' } });
  expect(payments.map(({ amount, method, shiftId, orderId }) => ({ amount, method, shiftId, orderId }))).toEqual([
    { amount: 2500, method: 'cash', shiftId: shift.id, orderId: null },
    { amount: 4000, method: 'card', shiftId: shift.id, orderId: null },
  ]);
  expect(await prisma.deviceUnit.count({ where: { imei: serial } })).toBe(0);

  await page.goto('/account/devices');
  await expect(page.getByTestId(`service-payment-status-${workOrder.id}`)).toContainText('Оплачено · 6 500 с');
  await prisma.payment.create({
    data: {
      serviceWorkOrderId: workOrder.id,
      originalPaymentId: payments[0].id,
      amount: -1000,
      method: payments[0].method,
      status: 'refunded',
    },
  });
  await page.reload();
  await expect(page.getByTestId(`service-payment-status-${workOrder.id}`)).toContainText('Частичный возврат · осталось оплачено 5 500 с');
  const eventTypes = (await prisma.auditEvent.findMany({ where: { refs: { has: workOrder.id } }, orderBy: { ts: 'asc' } })).map((event) => event.type);
  expect(eventTypes).toHaveLength(7);
  expect(eventTypes).toEqual(expect.arrayContaining([
    'service.paid_repair_received',
    'service.work_order_created',
    'service.diagnostics_completed',
    'service.estimate_approved',
    'payment.received',
    'payment.received',
    'service.payment_completed',
  ]));
});

test('ERP issues and returns a loaner while the customer sees custody on the site', async ({ page }) => {
  await resetDb();
  const owner = await seedStaffCredentials('owner', 'e2e-loaner-owner');
  const phone = '+996700950003';
  const customer = await prisma.customer.create({ data: { phone, name: 'Loaner E2E Customer' } });
  const product = await prisma.product.create({ data: { sku: `LOANER-UI-${Date.now()}`, name: 'iPhone 15 Loaner', price: 90000, cost: 70000, category: 'phones', attrs: {} } });
  const repairImei = `LOANER-UI-${Date.now()}-REPAIR`;
  const loanerImei = `LOANER-UI-${Date.now()}-DEVICE`;
  await prisma.deviceUnit.create({ data: { imei: repairImei, productId: product.id, status: 'in_repair', location: 'BISHKEK-1' } });
  await prisma.deviceUnit.create({ data: { imei: loanerImei, productId: product.id, status: 'in_stock', location: 'BISHKEK-1' } });
  const warrantyCase = await prisma.warrantyCase.create({ data: { imei: repairImei, customerId: customer.id, problem: 'Не включается', status: 'received', sla: new Date(Date.now() + 7 * 86400000) } });
  const workOrder = await prisma.serviceWorkOrder.create({ data: { warrantyCaseId: warrantyCase.id, technicianId: owner.staffId, createdBy: owner.staffId, point: 'BISHKEK-1' } });
  const png = readFileSync('node_modules/@jest/reporters/assets/jest_logo.png');

  await page.addInitScript((session) => localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(session)), { accessToken: owner.accessToken, staffId: owner.staffId, username: owner.username, role: 'owner', totpEnabled: false });
  await page.goto('/erp');
  await page.getByRole('button', { name: /Сервис-центр/ }).click();
  await page.getByRole('tab', { name: 'Подменный фонд' }).click();
  await page.getByLabel('IMEI').fill(loanerImei);
  await page.getByRole('button', { name: 'Добавить в фонд' }).click();
  await expect(page.getByTestId('loaner-fund')).toContainText('Свободен');
  await page.getByLabel('Подменное устройство').selectOption({ index: 1 });
  await page.getByLabel('Заказ-наряд').selectOption(workOrder.id);
  await page.getByLabel('Номер расписки').fill('LN-E2E-001');
  await page.getByLabel('Фото при выдаче').setInputFiles({ name: 'issue.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Оформить и выдать' }).click();
  const loanerCard = page.locator('[data-testid^="loaner-device-"]').filter({ hasText: 'iPhone 15 Loaner' });
  await expect(loanerCard).toContainText('Выдан');

  const tokens = { accessToken: sign({ sub: customer.id, phone, typ: 'customer' }, 'dev-secret-alistore-local', { expiresIn: '1h' }), refreshToken: 'loaner-e2e-refresh' };
  await page.evaluate((auth) => localStorage.setItem('alistore.auth.v1', JSON.stringify(auth)), tokens);
  await page.goto('/account/devices');
  const customerLoaner = page.locator('[data-testid^="customer-loaner-"]');
  await expect(customerLoaner).toContainText('iPhone 15 Loaner');
  await expect(customerLoaner).toContainText('LN-E2E-001');

  await page.goto('/erp');
  await page.getByRole('button', { name: /Сервис-центр/ }).click();
  await page.getByRole('tab', { name: 'Подменный фонд' }).click();
  await page.locator('[data-testid^="loaner-device-"]').getByRole('button', { name: 'Принять возврат' }).click();
  await page.getByLabel('Фото при возврате').setInputFiles({ name: 'return.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Принять возврат' }).last().click();
  await expect(page.getByRole('status')).toContainText('Устройство возвращено');
  await expect(page.locator('[data-testid^="loaner-device-"]')).toContainText('Свободен');
  await expect(prisma.deviceUnit.findUniqueOrThrow({ where: { imei: loanerImei } })).resolves.toMatchObject({ status: 'loaner_available' });
  expect((await prisma.loanerLoan.findFirstOrThrow({ where: { workOrderId: workOrder.id } })).status).toBe('returned');
});
