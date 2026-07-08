import { expect, test } from '@playwright/test';
import { API_BASE, bootstrapStaff, prisma, resetDb, seedProduct } from './helpers';

test('POS sale over discount threshold parks an approval', async ({ request }) => {
  await resetDb();
  const staffToken = await bootstrapStaff(request);
  const { product } = await seedProduct('POS-E2E');

  const response = await request.post(`${API_BASE}/pos/sale`, {
    headers: { authorization: `Bearer ${staffToken}` },
    data: {
      staffId: 'spoofed-body-staff',
      point: 'BISHKEK-1',
      method: 'cash',
      discountPct: 15,
      reason: 'e2e discount approval',
      lines: [{ productId: product.id, sku: product.sku, price: product.price, qty: 1 }],
    },
  });

  expect(response.status()).toBe(202);
  const body = (await response.json()) as { approvalId: string; pendingApproval: boolean };
  expect(body.pendingApproval).toBe(true);
  expect(body.approvalId).toBeTruthy();
  const approval = await prisma.approval.findUnique({ where: { id: body.approvalId } });
  expect(approval).toMatchObject({ action: 'discount', status: 'requested' });
});
