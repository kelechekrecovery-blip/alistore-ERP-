import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedProduct, seedStaffCredentials } from './helpers';

/**
 * UI-010 print cluster. The print endpoints (documents/*, labels/*,
 * receipts/order) existed on the API but no web screen called them. These
 * journeys drive every newly wired surface as the owner: staff order queue
 * (invoice PDF + receipt), ERP stock price-tag QR label, warehouse intake IMEI
 * stickers and the approval write-off act — asserting the exact API request
 * and the browser print/download consequence.
 */
async function staffSession(page: import('@playwright/test').Page, role: 'owner' | 'warehouse' = 'owner') {
  const session = await seedStaffCredentials(role, 'e2e-print');
  await page.addInitScript((auth) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(auth));
  }, { accessToken: session.accessToken, staffId: session.staffId, username: session.username, role, totpEnabled: false });
  return session;
}

test('staff order queue prints the invoice PDF and the server receipt', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('E2E-PRINT-QUEUE');
  const customer = await prisma.customer.create({ data: { phone: '+996700424201', name: 'Печать Клиент' } });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      channel: 'web',
      status: 'created',
      subtotal: 100000,
      total: 100000,
      items: { create: { sku: product.sku, qty: 1, price: 100000 } },
    },
  });
  await staffSession(page);

  await page.goto('/staff');
  await page.getByRole('button', { name: /Заказы/ }).first().click();
  await expect(page.getByText(`#${order.id.slice(-6)}`)).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  const invoiceRequest = page.waitForRequest(`**/api/documents/order/${order.id}/invoice`);
  await page.getByRole('button', { name: '⎙ Накладная' }).click();
  await invoiceRequest;
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`invoice-${order.id}.pdf`);
  await expect(page.getByText('Накладная скачана')).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  const receiptRequest = page.waitForRequest(`**/api/receipts/order/${order.id}`);
  await page.getByRole('button', { name: '⎙ Чек' }).click();
  await receiptRequest;
  const popup = await popupPromise;
  await expect(popup.locator('svg')).toBeVisible();
});

test('ERP stock prints a QR price tag for a product', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('E2E-PRINT-TAG');
  await staffSession(page);

  await page.goto('/erp');
  await page.getByRole('button', { name: /Склад/ }).first().click();
  await expect(page.getByText(product.name)).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  const labelRequest = page.waitForRequest('**/api/labels/qr');
  await page.getByRole('button', { name: `Печать ценника: ${product.name}` }).click();
  const request = await labelRequest;
  expect(request.method()).toBe('POST');
  expect(request.postDataJSON()).toEqual({ text: expect.stringContaining(`/product/${product.id}`) });
  const popup = await popupPromise;
  await expect(popup.locator('svg')).toBeVisible();
  await expect(popup.getByText(new RegExp(product.name))).toBeVisible();
});

test('warehouse intake prints one IMEI sticker per received unit', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('E2E-PRINT-INTAKE');
  await staffSession(page);

  await page.goto('/warehouse');
  await expect(page.getByText('Операции склада')).toBeVisible();
  const imeis = [`E2E-IN-${Date.now().toString(36)}-1`, `E2E-IN-${Date.now().toString(36)}-2`];
  await page.getByPlaceholder('IMEI / SN, каждый с новой строки').fill(imeis.join('\n'));
  await page.getByRole('button', { name: 'Принять', exact: true }).click();
  await expect(page.getByText(/✓ Принято 2 шт/)).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  const labelBodiesPromise = new Promise<unknown[]>((resolve) => {
    const bodies: unknown[] = [];
    const onRequest = (request: import('@playwright/test').Request) => {
      if (!request.url().includes('/api/labels/imei')) return;
      bodies.push(request.postDataJSON());
      if (bodies.length === imeis.length) {
        page.off('request', onRequest);
        resolve(bodies);
      }
    };
    page.on('request', onRequest);
  });
  await page.getByRole('button', { name: '⎙ Печать этикеток (2)' }).click();
  const labelBodies = await labelBodiesPromise;
  expect(labelBodies.map((body) => (body as { imei?: string }).imei).sort()).toEqual([...imeis].sort());
  const popup = await popupPromise;
  await expect(popup.locator('svg')).toHaveCount(2);
  await expect.poll(async () =>
    prisma.deviceUnit.count({ where: { productId: product.id, imei: { in: imeis } } }),
  ).toBe(2);
});

test('approved write-off approval downloads the write-off act PDF', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('E2E-PRINT-WO');
  const movement = await prisma.inventoryMovement.create({
    data: { productId: product.id, qty: -2, type: 'write_off', from: 'BISHKEK-1', reason: 'брак' },
  });
  const approval = await prisma.approval.create({
    data: {
      action: 'write_off',
      requester: 'e2e-warehouse',
      approver: 'e2e-owner',
      status: 'approved',
      reason: 'брак при приёмке',
      evidence: { payload: { productId: product.id, qty: 2, location: 'BISHKEK-1' } },
    },
  });
  await prisma.auditEvent.create({
    data: {
      type: 'stock.written_off',
      actor: 'e2e-owner',
      payload: { approvalId: approval.id, productId: product.id, movementId: movement.id, qty: 2 },
      refs: [product.id, movement.id],
    },
  });
  await staffSession(page);

  await page.goto('/approvals');
  await page.getByRole('button', { name: 'Одобрено' }).click();
  await expect(page.getByText(`#${approval.id.slice(-8)}`)).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  const actRequest = page.waitForRequest(`**/api/documents/writeoff/by-approval/${approval.id}/act`);
  await page.getByRole('button', { name: '⎙ Акт списания' }).click();
  await actRequest;
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`writeoff-act-${approval.id}.pdf`);
  await expect(page.getByText('Акт списания скачан')).toBeVisible();
});
