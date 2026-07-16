import { expect, test } from '@playwright/test';
import { authenticator } from '../apps/api/node_modules/otplib';
import { API_BASE, patchJson, postJson, prisma, resetDb, seedStaffCredentials } from './helpers';

test('staff exchanges a sold IMEI into a higher-priced replacement', async ({ request }) => {
  await resetDb();
  const requester = await seedStaffCredentials('cashier', 'e2e-exchange-requester');
  const approver = await seedStaffCredentials('owner', 'e2e-exchange-approver');
  const approverSecret = authenticator.generateSecret();
  await prisma.staffUser.update({
    where: { id: approver.staffId },
    data: { totpEnabled: true, totpSecret: approverSecret },
  });
  const shift = await prisma.cashShift.create({
    data: { staffId: requester.staffId, point: 'BISHKEK-1', openCash: 50_000 },
  });
  const customer = await prisma.customer.create({ data: { phone: '+996700900003', name: 'Exchange' } });
  const oldProduct = await prisma.product.create({
    data: { sku: 'E2E-OLD', name: 'Old Phone', price: 100000, cost: 80000, category: 'phones', attrs: {} },
  });
  const newProduct = await prisma.product.create({
    data: { sku: 'E2E-NEW', name: 'New Phone', price: 120000, cost: 90000, category: 'phones', attrs: {} },
  });
  const original = await prisma.order.create({
    data: {
      customerId: customer.id,
      channel: 'pos',
      status: 'paid',
      total: 100000,
      items: { create: [{ sku: oldProduct.sku, qty: 1, price: 100000, imei: 'E2E-OLD-IMEI' }] },
    },
  });
  await prisma.deviceUnit.create({
    data: { imei: 'E2E-OLD-IMEI', productId: oldProduct.id, status: 'sold', orderId: original.id, location: 'BISHKEK-1' },
  });
  await prisma.deviceUnit.create({
    data: { imei: 'E2E-NEW-IMEI', productId: newProduct.id, status: 'in_stock', location: 'BISHKEK-1' },
  });

  const result = await postJson<{
    exchangeRequestId: string;
    approvalId: string;
    surchargeAmount: number;
    newImei: string;
  }>(
    request,
    '/exchanges',
    { originalOrderId: original.id, oldImei: 'E2E-OLD-IMEI', newProductId: newProduct.id, method: 'cash', shiftId: shift.id },
    requester.accessToken,
    { 'idempotency-key': 'e2e-exchange-1' },
  );

  expect(result.surchargeAmount).toBe(20000);
  expect(result.newImei).toBe('E2E-NEW-IMEI');
  expect((await prisma.deviceUnit.findUnique({ where: { imei: 'E2E-OLD-IMEI' } }))?.status).toBe('sold');
  expect((await prisma.deviceUnit.findUnique({ where: { imei: 'E2E-NEW-IMEI' } }))?.status).toBe('reserved');

  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const totpToken = authenticator.generate(approverSecret);
  const failedApproval = await request.patch(`${API_BASE}/approvals/${result.approvalId}/decide`, {
    headers: { authorization: `Bearer ${approver.accessToken}` },
    data: { status: 'approved', totpToken },
  });
  expect(failedApproval.status()).toBe(409);
  expect(await prisma.staffUser.findUniqueOrThrow({ where: { id: approver.staffId } }))
    .toMatchObject({ totpLastToken: null });

  const foreignEvidence = await request.post(`${API_BASE}/evidence/images`, {
    headers: { authorization: `Bearer ${approver.accessToken}` },
    multipart: {
      file: { name: 'foreign-exchange.png', mimeType: 'image/png', buffer: tinyPng },
      entityType: 'exchange',
      entityId: result.exchangeRequestId,
      label: 'exchange_condition',
    },
  });
  expect(foreignEvidence.status()).toBe(403);
  const evidence = await request.post(`${API_BASE}/evidence/images`, {
    headers: { authorization: `Bearer ${requester.accessToken}` },
    multipart: {
      file: { name: 'exchange.png', mimeType: 'image/png', buffer: tinyPng },
      entityType: 'exchange',
      entityId: result.exchangeRequestId,
      label: 'exchange_condition',
    },
  });
  expect(evidence.ok(), await evidence.text()).toBeTruthy();
  await patchJson(request, `/approvals/${result.approvalId}/decide`, {
    status: 'approved',
    totpToken,
  }, approver.accessToken);

  const executed = await prisma.exchangeRequest.findUniqueOrThrow({ where: { id: result.exchangeRequestId } });
  expect(executed.status).toBe('executed');
  expect((await prisma.deviceUnit.findUnique({ where: { imei: 'E2E-OLD-IMEI' } }))?.status).toBe('returned');
  expect((await prisma.deviceUnit.findUnique({ where: { imei: 'E2E-NEW-IMEI' } }))?.status).toBe('sold');
  expect((await prisma.order.findUnique({ where: { id: executed.exchangeOrderId! } }))?.status).toBe('paid');
});

test('exchange workspace uploads condition evidence and shows approval handoff', async ({ page }) => {
  await resetDb();
  const requester = await seedStaffCredentials('cashier', 'e2e-exchange-ui');
  await prisma.cashShift.create({
    data: { staffId: requester.staffId, point: 'BISHKEK-1', openCash: 10_000 },
  });
  const customer = await prisma.customer.create({ data: { phone: '+996700900013', name: 'Exchange UI' } });
  const oldProduct = await prisma.product.create({
    data: { sku: 'E2E-UI-OLD', name: 'iPhone 14 UI', price: 100000, cost: 80000, category: 'phones', attrs: {} },
  });
  const newProduct = await prisma.product.create({
    data: { sku: 'E2E-UI-NEW', name: 'iPhone 15 UI', price: 125000, cost: 90000, category: 'phones', attrs: {} },
  });
  const original = await prisma.order.create({
    data: {
      customerId: customer.id,
      channel: 'pos',
      status: 'paid',
      total: 100000,
      storePointCode: 'BISHKEK-1',
      fulfillmentLocation: 'BISHKEK-1',
      items: { create: [{ sku: oldProduct.sku, qty: 1, price: 100000, imei: 'E2E-UI-OLD-IMEI' }] },
    },
  });
  await prisma.deviceUnit.create({
    data: { imei: 'E2E-UI-OLD-IMEI', productId: oldProduct.id, status: 'sold', orderId: original.id, location: 'BISHKEK-1' },
  });
  await prisma.deviceUnit.create({
    data: { imei: 'E2E-UI-NEW-IMEI', productId: newProduct.id, status: 'in_stock', location: 'BISHKEK-1' },
  });
  await page.addInitScript((session) => {
    window.localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(session));
  }, {
    accessToken: requester.accessToken,
    staffId: requester.staffId,
    username: requester.username,
    role: 'cashier',
    totpEnabled: false,
  });
  await page.goto('/exchange');
  await page.getByPlaceholder('IMEI проданного устройства').fill('E2E-UI-OLD-IMEI');
  await page.getByRole('button', { name: 'Найти' }).click();
  await expect(page.getByText('iPhone 14 UI')).toBeVisible();
  await page.locator('select').selectOption(newProduct.id);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'exchange.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByRole('button', { name: 'Запросить обмен' }).click();
  await expect(page.getByText('Отправлено на одобрение')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Открыть Approval Inbox' })).toBeVisible();
  const request = await prisma.exchangeRequest.findFirstOrThrow({ where: { requester: requester.staffId } });
  expect(request).toMatchObject({ status: 'requested', oldImei: 'E2E-UI-OLD-IMEI', newImei: 'E2E-UI-NEW-IMEI' });
  expect(await prisma.auditEvent.count({
    where: { type: 'evidence.attached', refs: { has: request.id } },
  })).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
});
