import { expect, test } from '@playwright/test';
import { bootstrapStaff, customerToken, patchJson, postJson, prisma, resetDb } from './helpers';

test('customer return request leads to staff refund approval request', async ({ request }) => {
  await resetDb();
  const staffToken = await bootstrapStaff(request);
  const phone = '+996700900002';
  const accessToken = await customerToken(request, phone);
  const customer = await prisma.customer.findUniqueOrThrow({ where: { phone } });
  const order = await prisma.order.create({
    data: { customerId: customer.id, channel: 'web', status: 'paid', total: 100000 },
  });
  const payment = await prisma.payment.create({
    data: { orderId: order.id, amount: 100000, method: 'card', status: 'received' },
  });

  const ret = await postJson<{ id: string; status: string }>(
    request,
    '/returns',
    { orderId: order.id, reason: 'e2e return' },
    accessToken,
  );
  expect(ret.status).toBe('requested');
  await patchJson(request, `/returns/${ret.id}`, { status: 'under_review' }, staffToken);
  await patchJson(request, `/returns/${ret.id}`, { status: 'approved' }, staffToken);

  const refund = await postJson<{ approvalId: string; status: string }>(
    request,
    `/payments/${payment.id}/refund`,
    { amount: 100000, reason: 'e2e approved return' },
    staffToken,
  );
  expect(refund.status).toBe('requested');
  const approval = await prisma.approval.findUnique({ where: { id: refund.approvalId } });
  expect(approval).toMatchObject({ action: 'refund', status: 'requested' });
});
