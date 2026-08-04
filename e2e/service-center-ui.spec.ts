import { expect, test } from '@playwright/test';
import { sign } from 'jsonwebtoken';
import { readFileSync } from 'node:fs';
import { API_BASE, prisma, resetDb, seedStaffCredentials } from './helpers';

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
  const partBalance = await prisma.inventoryBalance.create({
    data: { productId: partProduct.id, location: 'BISHKEK-1', onHand: 2, inventoryValue: 4000 },
  });
  const oldestPartLayer = await prisma.inventoryValuationLayer.create({
    data: {
      productId: partProduct.id,
      balanceId: partBalance.id,
      location: 'BISHKEK-1',
      sourceType: 'service.browser.receive',
      sourceRef: `service-browser-layer-${warrantyCase.id}`,
      unitCost: 1800,
      quantityReceived: 1,
      quantityRemaining: 1,
      createdAt: new Date(Date.now() - 86_400_000),
    },
  });
  const newestPartLayer = await prisma.inventoryValuationLayer.create({
    data: {
      productId: partProduct.id,
      balanceId: partBalance.id,
      location: 'BISHKEK-1',
      sourceType: 'service.browser.receive',
      sourceRef: `service-browser-layer-new-${warrantyCase.id}`,
      unitCost: 2200,
      quantityReceived: 1,
      quantityRemaining: 1,
      createdAt: new Date(),
    },
  });
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
  await expect(prisma.inventoryBalance.findUniqueOrThrow({ where: { id: partBalance.id } })).resolves.toMatchObject({
    onHand: 1,
    reserved: 0,
    inventoryValue: 2200,
  });
  const partMovement = await prisma.inventoryMovement.findFirstOrThrow({
    where: { productId: partProduct.id, type: 'service_consumed' },
  });
  expect(partMovement).toMatchObject({ qty: -1, valuationQty: 1, unitCost: 1800, totalValue: 1800 });
  const serviceParts = await prisma.servicePart.findMany({ where: { workOrderId: workOrder.id } });
  expect(serviceParts).toHaveLength(1);
  expect(serviceParts[0]).toMatchObject({ productId: partProduct.id, qty: 1, status: 'consumed', movementId: partMovement.id });
  expect(serviceParts[0].consumedAt).not.toBeNull();
  expect(await prisma.inventoryMovement.count({ where: { productId: partProduct.id, type: 'service_consumed' } })).toBe(1);
  const valuationIssues = await prisma.inventoryValuationIssue.findMany({
    where: { sourceType: 'service.consumed', sourceRef: { startsWith: `${partMovement.id}:` } },
  });
  expect(valuationIssues).toHaveLength(1);
  expect(valuationIssues[0]).toMatchObject({ layerId: oldestPartLayer.id, quantity: 1, reversedQty: 0, unitCost: 1800, totalCost: 1800 });
  await expect(prisma.inventoryValuationLayer.findUniqueOrThrow({ where: { id: oldestPartLayer.id } })).resolves.toMatchObject({
    quantityReceived: 1,
    quantityRemaining: 0,
  });
  await expect(prisma.inventoryValuationLayer.findUniqueOrThrow({ where: { id: newestPartLayer.id } })).resolves.toMatchObject({
    quantityReceived: 1,
    quantityRemaining: 1,
    unitCost: 2200,
  });
  const partJournal = await prisma.accountingJournalEntry.findUniqueOrThrow({
    where: { sourceType_sourceRef: { sourceType: 'service.consumed', sourceRef: partMovement.id } },
    include: { lines: true },
  });
  expect(partJournal.lines.map(({ accountCode, debit, credit }) => ({ accountCode, debit, credit })).sort((a, b) => a.accountCode.localeCompare(b.accountCode))).toEqual([
    { accountCode: '1200', debit: 0, credit: 1800 },
    { accountCode: '5000', debit: 1800, credit: 0 },
  ]);
  expect(partJournal.lines.reduce((sum, line) => sum + line.debit, 0)).toBe(1800);
  expect(partJournal.lines.reduce((sum, line) => sum + line.credit, 0)).toBe(1800);
  const warrantyEventTypes = (await prisma.auditEvent.findMany({
    where: { type: { startsWith: 'service.' }, refs: { has: workOrder.id } },
  })).map((event) => event.type).sort();
  expect(warrantyEventTypes).toEqual([
    'service.diagnostics_completed',
    'service.estimate_approved',
    'service.part_consumed',
    'service.part_reserved',
    'service.repair_completed',
    'service.repair_started',
    'service.work_order_closed',
    'service.work_order_created',
  ]);
  expect(await prisma.auditEvent.count({ where: { type: 'accounting.entry_posted', refs: { has: workOrder.id } } })).toBe(1);
  expect(await prisma.payment.count({ where: { serviceWorkOrderId: workOrder.id } })).toBe(0);
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
  expect(payments.map(({ amount, method, shiftId, orderId, status }) => ({ amount, method, shiftId, orderId, status }))).toEqual([
    { amount: 2500, method: 'cash', shiftId: shift.id, orderId: null, status: 'received' },
    { amount: 4000, method: 'card', shiftId: shift.id, orderId: null, status: 'received' },
  ]);
  expect(payments.map(({ amount, method, accountCode, accountingEntryId, receivedBy, point, txnId }) => ({ amount, method, accountCode, accountingEntryId, receivedBy, point, txnId }))).toEqual([
    { amount: 2500, method: 'cash', accountCode: '1000', accountingEntryId: expect.any(String), receivedBy: owner.staffId, point: 'BISHKEK-1', txnId: expect.stringMatching(/^service:.+:0$/) },
    { amount: 4000, method: 'card', accountCode: '1020', accountingEntryId: expect.any(String), receivedBy: owner.staffId, point: 'BISHKEK-1', txnId: expect.stringMatching(/^service:.+:1$/) },
  ]);
  expect(await prisma.deviceUnit.count({ where: { imei: serial } })).toBe(0);
  const paymentEntries = await prisma.accountingJournalEntry.findMany({
    where: { sourceType: 'payment.receipt', sourceRef: { in: payments.map((payment) => payment.id) } },
    include: { lines: true },
  });
  expect(paymentEntries).toHaveLength(2);
  for (const payment of payments) {
    const entry = paymentEntries.find((candidate) => candidate.sourceRef === payment.id);
    expect(entry).toBeDefined();
    expect(payment.accountingEntryId).toBe(entry!.id);
    const expected = payment.method === 'cash'
      ? { moneyAccount: '1000', taxAmount: 267, revenueAmount: 2233 }
      : { moneyAccount: '1020', taxAmount: 429, revenueAmount: 3571 };
    expect(entry).toMatchObject({
      point: 'BISHKEK-1',
      documentAmount: payment.amount,
      baseAmount: payment.amount,
      taxCode: 'vat_output:vat_standard',
      taxRateBps: 1200,
      taxAmount: expected.taxAmount,
    });
    expect(entry.documentAmount).toBe(entry.baseAmount);
    expect(entry.lines.reduce((sum, line) => sum + line.debit, 0)).toBe(entry.documentAmount);
    expect(entry.lines.reduce((sum, line) => sum + line.credit, 0)).toBe(entry.documentAmount);
    expect(entry.lines.map(({ accountCode, debit, credit }) => ({ accountCode, debit, credit })).sort((a, b) => a.accountCode.localeCompare(b.accountCode))).toEqual([
      { accountCode: expected.moneyAccount, debit: payment.amount, credit: 0 },
      { accountCode: '2200', debit: 0, credit: expected.taxAmount },
      { accountCode: '4100', debit: 0, credit: expected.revenueAmount },
    ].sort((a, b) => a.accountCode.localeCompare(b.accountCode)));
  }
  expect(paymentEntries.reduce((sum, entry) => sum + entry.taxAmount, 0)).toBe(696);
  const paymentLines = paymentEntries.flatMap((entry) => entry.lines);
  expect(paymentLines.reduce((sum, line) => sum + line.debit, 0)).toBe(6500);
  expect(paymentLines.reduce((sum, line) => sum + line.credit, 0)).toBe(6500);
  expect(paymentLines.filter((line) => line.accountCode === '2200').reduce((sum, line) => sum + line.credit, 0)).toBe(696);
  const accountTotals = new Map<string, { debit: number; credit: number }>();
  for (const line of paymentLines) {
    const total = accountTotals.get(line.accountCode) ?? { debit: 0, credit: 0 };
    total.debit += line.debit;
    total.credit += line.credit;
    accountTotals.set(line.accountCode, total);
  }
  expect(Object.fromEntries(accountTotals)).toEqual({
    '1000': { debit: 2500, credit: 0 },
    '1020': { debit: 4000, credit: 0 },
    '2200': { debit: 0, credit: 696 },
    '4100': { debit: 0, credit: 5804 },
  });
  expect(await prisma.serviceWorkOrderCommand.findMany({ where: { workOrderId: workOrder.id }, select: { action: true }, orderBy: { action: 'asc' } })).toEqual([
    { action: 'approve_estimate' },
    { action: 'create_paid' },
    { action: 'diagnose' },
    { action: 'pay' },
  ]);

  await page.goto('/account/devices');
  await expect(page.getByTestId(`service-payment-status-${workOrder.id}`)).toContainText('Оплачено · 6 500 с');
  const eventTypes = (await prisma.auditEvent.findMany({ where: { refs: { has: workOrder.id } }, orderBy: { ts: 'asc' } })).map((event) => event.type);
  expect(eventTypes.sort()).toEqual([
    'accounting.entry_posted',
    'accounting.entry_posted',
    'payment.received',
    'payment.received',
    'service.diagnostics_completed',
    'service.estimate_approved',
    'service.paid_repair_received',
    'service.payment_completed',
    'service.work_order_created',
  ].sort());
});

test('ERP issues and returns a loaner while the customer sees custody on the site', async ({ page, request }) => {
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
  await expect(prisma.deviceUnit.findUniqueOrThrow({ where: { imei: loanerImei } })).resolves.toMatchObject({ status: 'loaner_issued' });

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
  const loan = await prisma.loanerLoan.findFirstOrThrow({ where: { workOrderId: workOrder.id } });
  expect(loan).toMatchObject({ status: 'returned', customerId: customer.id, agreementRef: 'LN-E2E-001', depositAmount: 0 });
  expect(loan.issuedAt).not.toBeNull();
  expect(loan.returnedAt).not.toBeNull();
  const loanerEvents = await prisma.auditEvent.findMany({
    where: { type: { startsWith: 'service.loaner_' }, refs: { has: loan.id } },
  });
  expect(loanerEvents.map((event) => event.type)).toEqual(expect.arrayContaining([
    'service.loaner_prepared',
    'service.loaner_issued',
    'service.loaner_returned',
  ]));
  expect(loanerEvents).toHaveLength(3);
  expect(await prisma.auditEvent.count({ where: { type: 'service.loaner_registered', refs: { has: loanerImei } } })).toBe(1);
  expect(await prisma.serviceWorkOrderCommand.findMany({ where: { workOrderId: workOrder.id }, select: { action: true }, orderBy: { action: 'asc' } })).toEqual([
    { action: 'issue_loaner' },
    { action: 'prepare_loaner' },
    { action: 'return_loaner' },
  ]);
  const evidenceEvents = await prisma.auditEvent.findMany({
    where: { type: 'evidence.attached', refs: { has: loan.id } },
  });
  expect(evidenceEvents).toHaveLength(2);
  const evidenceAssets = evidenceEvents.map((event) => {
    const payload = event.payload as { entityType?: string; entityId?: string; label?: string; trustedStaffEvidence?: boolean; asset?: { key?: string; url?: string; width?: number; height?: number; bytes?: number; format?: string } };
    expect(event.actor).toBe(`staff:${owner.staffId}`);
    expect(payload).toMatchObject({ entityType: 'loaner', entityId: loan.id, trustedStaffEvidence: true, asset: { key: expect.any(String) } });
    return { label: payload.label, ...payload.asset };
  });
  expect(evidenceAssets.map(({ label }) => label).sort()).toEqual(['loaner_issue', 'loaner_return']);
  expect(new Set(evidenceAssets.map(({ key }) => key)).size).toBe(2);
  for (const asset of evidenceAssets) {
    expect(asset.key).toMatch(new RegExp(`^evidence/loaner/${loan.id}/`));
    expect(asset).toMatchObject({ width: expect.any(Number), height: expect.any(Number), bytes: expect.any(Number), format: 'webp' });
    expect(asset.width).toBeGreaterThan(0);
    expect(asset.height).toBeGreaterThan(0);
    expect(asset.bytes).toBeGreaterThan(0);
    await expect(prisma.mediaCleanupTask.findUniqueOrThrow({ where: { objectKey: asset.key! } })).resolves.toMatchObject({ completedAt: expect.any(Date) });
    const stored = await request.get(new URL(asset.url!, API_BASE).toString());
    expect(stored.ok()).toBe(true);
    expect(stored.headers()['content-type']).toContain('image/webp');
    const bytes = await stored.body();
    expect(bytes.byteLength).toBe(asset.bytes);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
  }
  await page.evaluate((auth) => localStorage.setItem('alistore.auth.v1', JSON.stringify(auth)), tokens);
  await page.goto('/account/devices');
  await expect(page.locator('[data-testid^="customer-loaner-"]')).toHaveCount(0);
});
