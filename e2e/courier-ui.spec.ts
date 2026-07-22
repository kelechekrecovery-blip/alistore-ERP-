import { expect, test } from '@playwright/test';
import { postJson, prisma, resetDb, seedStaffCredentials } from './helpers';

const evidencePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test.afterEach(async () => resetDb());

test('courier completes an assigned delivery and reconciles COD through the web app', async ({ page, request }) => {
  await resetDb();
  const courier = await seedStaffCredentials('courier', 'e2e-courier-web');
  const cashier = await seedStaffCredentials('cashier', 'e2e-courier-cashier');
  await postJson(
    request,
    '/shifts/open',
    { staffId: cashier.staffId, point: 'BISHKEK-1', openCash: 5000 },
    cashier.accessToken,
    { 'idempotency-key': `e2e-courier-cashier-open-${Date.now()}` },
  );
  const customer = await prisma.customer.create({
    data: { phone: '+996700123456', name: 'Айжан Т.' },
  });
  const run = await prisma.courierRun.create({
    data: {
      courierId: courier.staffId,
      codTotal: 100_300,
      collectedTotal: 0,
      assignmentIdempotencyKey: 'e2e-courier-web-run',
    },
  });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      channel: 'web',
      fulfillmentType: 'courier',
      paymentMode: 'cod',
      paymentModeExplicit: true,
      status: 'courier_assigned',
      courierId: courier.staffId,
      courierRunId: run.id,
      subtotal: 100_000,
      deliveryFee: 300,
      total: 100_300,
      deliveryAddress: 'Бишкек, ул. Киевская 95',
      deliverySlot: '10:00–12:00',
      items: { create: { sku: 'E2E-COURIER-WEB', qty: 1, price: 100_000 } },
    },
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((session) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(session));
  }, {
    accessToken: courier.accessToken,
    staffId: courier.staffId,
    username: courier.username,
    role: 'courier',
    totpEnabled: false,
  });
  await page.goto('/courier');

  const card = page.getByTestId(`courier-delivery-${order.id}`);
  await expect(card).toContainText('Айжан Т.');
  await expect(card).toContainText('100 300 сом');
  await card.getByRole('button', { name: 'Начать доставку' }).click();
  await expect.poll(async () => (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status)
    .toBe('out_for_delivery');

  await card.getByLabel(`Фото Evidence для заказа ${order.id}`).setInputFiles({
    name: 'delivery.png',
    mimeType: 'image/png',
    buffer: evidencePng,
  });
  await card.getByLabel(`Получено COD для заказа ${order.id}`).fill('100000');
  await expect(card.getByLabel(`Причина частичной оплаты для заказа ${order.id}`)).toBeVisible();
  await expect(card.getByRole('button', { name: 'Подтвердить доставку' })).toBeDisabled();
  await card.getByLabel(`Получено COD для заказа ${order.id}`).fill('100300');
  await expect(card.getByRole('button', { name: 'Подтвердить доставку' })).toBeEnabled();
  await card.getByRole('button', { name: 'Подтвердить доставку' }).click();
  await expect.poll(async () => (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status)
    .toBe('delivered');
  await expect.poll(async () => (await prisma.courierRun.findUniqueOrThrow({ where: { id: run.id } })).collectedTotal)
    .toBe(100_300);
  expect(await prisma.auditEvent.count({ where: { type: 'evidence.attached', refs: { has: order.id } } })).toBe(1);

  await page.getByRole('button', { name: 'COD', exact: true }).click();
  const runCard = page.getByTestId(`courier-run-${run.id}`);
  await expect(runCard).toContainText('100 300 сом');
  await expect(runCard).toContainText('подтверждает принимающий сотрудник');
  await expect(runCard.getByRole('button', { name: /Сдать/ })).toHaveCount(0);

  await page.addInitScript((session) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(session));
  }, {
    accessToken: cashier.accessToken,
    staffId: cashier.staffId,
    username: cashier.username,
    role: 'cashier',
    totpEnabled: false,
  });
  await page.goto(`/courier-cash?runId=${encodeURIComponent(run.id)}`);
  const cashCard = page.getByTestId(`cash-run-${run.id}`);
  await expect(cashCard).toContainText('Курьер заявил 100 300 сом');
  await cashCard.getByRole('button', { name: 'Принять 100 300 сом' }).click();
  await expect(page.getByRole('status')).toContainText('COD принят кассиром');
  await expect.poll(async () => (await prisma.courierRun.findUniqueOrThrow({ where: { id: run.id } })).handedOver)
    .toBe(true);
  expect(await prisma.auditEvent.count({ where: { type: 'cash.handover', refs: { has: run.id } } })).toBe(1);
  expect(await prisma.auditEvent.findFirstOrThrow({ where: { type: 'cash.handover', refs: { has: run.id } } }))
    .toMatchObject({ actor: cashier.staffId });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
});

test('courier records failed delivery with Evidence and returns it to dispatch', async ({ page }) => {
  await resetDb();
  const courier = await seedStaffCredentials('courier', 'e2e-courier-failure');
  const customer = await prisma.customer.create({
    data: { phone: '+996700654321', name: 'Бакыт К.' },
  });
  const run = await prisma.courierRun.create({
    data: {
      courierId: courier.staffId,
      codTotal: 45_900,
      collectedTotal: 0,
      assignmentIdempotencyKey: 'e2e-courier-failure-run',
    },
  });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      channel: 'web',
      fulfillmentType: 'courier',
      paymentMode: 'cod',
      paymentModeExplicit: true,
      status: 'out_for_delivery',
      courierId: courier.staffId,
      courierRunId: run.id,
      subtotal: 45_900,
      total: 45_900,
      deliveryAddress: 'Бишкек, ул. Токтогула 125',
      items: { create: { sku: 'E2E-COURIER-FAIL', qty: 1, price: 45_900 } },
    },
  });
  await page.addInitScript((session) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(session));
  }, {
    accessToken: courier.accessToken,
    staffId: courier.staffId,
    username: courier.username,
    role: 'courier',
    totpEnabled: false,
  });
  await page.goto('/courier');

  const card = page.getByTestId(`courier-delivery-${order.id}`);
  await card.getByLabel(`Фото Evidence для заказа ${order.id}`).setInputFiles({
    name: 'failed-delivery.png',
    mimeType: 'image/png',
    buffer: evidencePng,
  });
  await card.getByText('Не удалось доставить').click();
  await card.getByLabel(`Причина неуспешной доставки ${order.id}`).fill('Клиент недоступен');
  await card.getByRole('button', { name: 'Записать и вернуть диспетчеру' }).click();

  await expect.poll(async () => (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status)
    .toBe('paid');
  expect(await prisma.auditEvent.count({ where: { type: 'delivery.failed', refs: { has: order.id } } })).toBe(1);
  expect(await prisma.auditEvent.count({ where: { type: 'delivery.unassigned', refs: { has: order.id } } })).toBe(1);
  expect(await prisma.auditEvent.count({ where: { type: 'evidence.attached', refs: { has: order.id } } })).toBe(1);
  expect(await prisma.courierRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
    codTotal: 0,
    collectedTotal: 0,
  });
});

test('courier route rejects a non-courier staff session', async ({ page }) => {
  await resetDb();
  const cashier = await seedStaffCredentials('cashier', 'e2e-courier-role');
  await page.addInitScript((session) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(session));
  }, {
    accessToken: cashier.accessToken,
    staffId: cashier.staffId,
    username: cashier.username,
    role: 'cashier',
    totpEnabled: false,
  });
  await page.goto('/courier');
  await expect(page.getByRole('heading', { name: 'Нужна роль courier' })).toBeVisible();
  await expect(page.getByTestId('courier-app')).toHaveCount(0);
});
