import { expect, test } from '@playwright/test';
import { bootstrapStaff, customerToken, patchJson, postJson, prisma, resetDb } from './helpers';

test('customer return request appears in ERP and leads to a bound refund approval', async ({ page, request }) => {
  await resetDb();
  const staffToken = await bootstrapStaff(request);
  const phone = '+996700900002';
  const accessToken = await customerToken(request, phone);
  const customer = await prisma.customer.findUniqueOrThrow({ where: { phone } });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      channel: 'web',
      status: 'paid',
      subtotal: 100000,
      total: 100000,
      items: { create: { sku: 'E2E-RETURN-PHONE', qty: 2, price: 50000 } },
    },
  });
  const payment = await prisma.payment.create({
    data: { orderId: order.id, amount: 100000, method: 'card', status: 'received' },
  });

  await page.addInitScript((token) => {
    window.localStorage.setItem('alistore.auth.v1', JSON.stringify({ accessToken: token, refreshToken: 'e2e-refresh' }));
  }, accessToken);
  await page.goto('/account/returns');
  await expect(page.getByText('E2E-RETURN-PHONE')).toBeVisible();
  await page.getByRole('button', { name: 'Уменьшить E2E-RETURN-PHONE' }).click();
  await page.getByRole('button', { name: 'Не подошёл / передумал' }).click();
  await page.getByRole('button', { name: 'Отправить заявку' }).click();
  await expect(page.getByText('Заявка отправлена')).toBeVisible();
  const ret = await prisma.return.findFirstOrThrow({ where: { orderId: order.id }, include: { items: true } });
  expect(ret.status).toBe('requested');
  expect(ret).toMatchObject({ refundAmount: 50000, isFullOrder: false });
  expect(ret.items).toMatchObject([{ qty: 1, refundAmount: 50000 }]);
  await patchJson(request, `/returns/${ret.id}`, { status: 'under_review' }, staffToken);
  await patchJson(request, `/returns/${ret.id}`, { status: 'approved' }, staffToken);
  await patchJson(request, `/returns/${ret.id}`, { status: 'processing' }, staffToken);

  await page.addInitScript(({ token }) => {
    window.localStorage.setItem('alistore.staff.auth.v1', JSON.stringify({
      accessToken: token,
      staffId: 'e2e-owner',
      username: 'owner',
      role: 'owner',
      totpEnabled: true,
    }));
  }, { token: staffToken });
  await page.goto('/approvals');
  await expect(page.getByText('Return Desk')).toBeVisible();
  await expect(page.getByText(ret.id)).toBeVisible();
  await page.getByRole('button', { name: 'В refund' }).click();
  await expect(page.getByLabel('returnId')).toHaveValue(ret.id);
  await expect(page.getByLabel('paymentId')).toHaveValue(payment.id);
  await expect(page.getByLabel('сумма возврата')).toHaveValue('50000');

  const refund = await postJson<{ approvalId: string; status: string }>(
    request,
    `/payments/${payment.id}/refund`,
    { amount: 50000, reason: 'e2e approved return', returnId: ret.id },
    staffToken,
  );
  expect(refund.status).toBe('requested');
  const approval = await prisma.approval.findUnique({ where: { id: refund.approvalId } });
  expect(approval).toMatchObject({ action: 'refund', status: 'requested' });
  expect(approval?.evidence).toMatchObject({ payload: { returnId: ret.id, paymentId: payment.id } });
});
