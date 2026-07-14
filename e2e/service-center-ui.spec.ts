import { expect, test } from '@playwright/test';
import { sign } from 'jsonwebtoken';
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

  const workOrder = await prisma.serviceWorkOrder.findUniqueOrThrow({ where: { warrantyCaseId: warrantyCase.id } });
  expect(workOrder).toMatchObject({ diagnosticSummary: 'Износ аккумулятора 71%', estimateAmount: 4500, diagnosticFee: 500, estimateApprovedBy: customer.id });
  expect(workOrder.estimateApprovedAt).not.toBeNull();
  await expect(prisma.warrantyCase.findUniqueOrThrow({ where: { id: warrantyCase.id } })).resolves.toMatchObject({ status: 'approved' });
  expect(await prisma.auditEvent.count({ where: { type: { startsWith: 'service.' }, refs: { has: workOrder.id } } })).toBe(3);
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
