import { expect, test } from '@playwright/test';
import { API_BASE, prisma, resetDb, seedStaffCredentials } from './helpers';

test.afterEach(async () => {
  await resetDb();
});

test('warehouse completes a reconciled courier order and posts customer value once', async ({ page, request }) => {
  await resetDb();
  const session = await seedStaffCredentials('warehouse', 'e2e-delivery-completion');
  const customer = await prisma.customer.create({
    data: { phone: '+996700424211', name: 'Доставленный клиент' },
  });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      channel: 'web',
      fulfillmentType: 'courier',
      status: 'delivered',
      subtotal: 100_000,
      total: 100_000,
      payments: {
        create: {
          amount: 100_000,
          method: 'card',
          status: 'received',
          txnId: `warehouse-delivered-${Date.now()}`,
          receivedBy: 'provider:test',
        },
      },
    },
  });

  await page.addInitScript((auth) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(auth));
  }, {
    accessToken: session.accessToken,
    staffId: session.staffId,
    username: session.username,
    role: 'warehouse',
    totpEnabled: false,
  });

  await page.goto('/warehouse');
  await page.getByRole('button', { name: 'Доставлено', exact: true }).click();
  await expect(page.getByText(`#${order.id.slice(-8)}`)).toBeVisible();
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page.getByText(new RegExp(`Заказ #${order.id.slice(-6)} → completed`))).toBeVisible();

  const replay = await request.post(`${API_BASE}/orders/${order.id}/transition`, {
    data: { to: 'completed' },
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  expect(replay.status()).toBe(422);

  await expect.poll(() => prisma.order.findUnique({ where: { id: order.id } }))
    .toMatchObject({ status: 'completed', loyaltyEarned: 1_000 });
  await expect.poll(() => prisma.customer.findUnique({ where: { id: customer.id } }))
    .toMatchObject({ ltv: 100_000 });
  await expect.poll(() => prisma.loyaltyEntry.count({
    where: { sourceRef: `loyalty:earn:${order.id}` },
  })).toBe(1);
  await expect.poll(() => prisma.auditEvent.count({
    where: { type: 'loyalty.earned', refs: { has: order.id } },
  })).toBe(1);
  await expect.poll(() => prisma.auditEvent.count({
    where: { type: 'order.completed', refs: { has: order.id } },
  })).toBe(1);
});
