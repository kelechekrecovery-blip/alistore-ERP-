import { expect, test } from '@playwright/test';
import { bootstrapStaff, customerToken, patchJson, prisma, resetDb } from './helpers';

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
  const cardPayment = await prisma.payment.create({
    data: { orderId: order.id, amount: 40000, method: 'card', status: 'received', txnId: 'e2e-card-capture' },
  });
  const qrPayment = await prisma.payment.create({
    data: { orderId: order.id, amount: 60000, method: 'qr_mbank', status: 'received', txnId: 'e2e-mbank-capture' },
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
  await expect(page.getByLabel('сумма возврата')).toHaveValue('50000');
  await expect(page.getByText(/API сам распределит сумму/)).toBeVisible();
  await page.getByRole('button', { name: 'Запросить refund' }).click();
  await expect(page.getByText(/Refund approval #/)).toBeVisible();

  const approval = await prisma.approval.findFirst({ where: { action: 'refund' }, orderBy: { createdAt: 'desc' } });
  expect(approval).toMatchObject({ action: 'refund', status: 'requested' });
  const refund = await prisma.refund.findUniqueOrThrow({
    where: { returnId: ret.id },
    include: { allocations: { orderBy: { ordinal: 'asc' } }, lines: true },
  });
  expect(approval?.evidence).toMatchObject({ payload: { refundId: refund.id } });
  expect(refund).toMatchObject({ amount: 50000, status: 'requested', approvalId: approval?.id });
  expect(refund.allocations).toMatchObject([
    { originalPaymentId: cardPayment.id, amount: 40000, methodSnapshot: 'card', status: 'queued' },
    { originalPaymentId: qrPayment.id, amount: 10000, methodSnapshot: 'qr_mbank', status: 'queued' },
  ]);
  expect(refund.lines).toMatchObject([{ qty: 1, grossAmount: 50000 }]);
  expect(await page.evaluate((returnId) => sessionStorage.getItem(`alistore.refund.idempotency.${returnId}`), ret.id)).toBeNull();

  // Simulate a provider-pending allocation parked by the stale sweep. The ERP
  // operator must be able to cancel it without inventing a provider callback.
  await prisma.refund.update({ where: { id: refund.id }, data: { status: 'failed' } });
  await prisma.refundAllocation.updateMany({
    where: { refundId: refund.id },
    data: { status: 'failed', lastError: 'provider_pending_stale:300000' },
  });
  await page.reload();
  await expect(page.getByText('Требует сверки refund')).toBeVisible();
  await page.getByRole('button', { name: 'Провайдер не исполнял' }).click();
  await page.getByLabel('Основание сверки refund').fill('Проверено по выписке: операция не исполнена');
  await page.getByRole('button', { name: 'Зафиксировать решение' }).click();
  await expect(page.getByText('Refund отменён оператором')).toBeVisible();
  await expect(prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).resolves.toMatchObject({ status: 'rejected' });
  await expect(prisma.return.findUniqueOrThrow({ where: { id: ret.id } })).resolves.toMatchObject({ status: 'rejected' });
});
