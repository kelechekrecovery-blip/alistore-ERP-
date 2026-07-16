import { expect, test } from '@playwright/test';
import { bootstrapStaff, postJson, prisma, resetDb } from './helpers';

test('staff intake creates a trade-in contract with IMEI risk reference', async ({ request }) => {
  await resetDb();
  const staffToken = await bootstrapStaff(request);
  const customer = await prisma.customer.create({ data: { phone: '+996700900004', name: 'Trade In' } });

  const tradeIn = await postJson<{ id: string; contractId: string; sellerPassportMasked: string; imei: string }>(
    request,
    '/tradeins/intake',
    {
      customerId: customer.id,
      model: 'iPhone 13 Pro',
      imei: 'E2E-TRADEIN-IMEI',
      grade: 'B',
      price: 42000,
      sellerPassport: 'ID1234567',
    },
    staffToken,
    { 'idempotency-key': 'e2e-tradein-intake' },
  );

  expect(tradeIn.contractId).toMatch(/^TI-/);
  expect(tradeIn.sellerPassportMasked).toBe('ID1***67');
  const events = await prisma.auditEvent.findMany({ where: { refs: { has: 'E2E-TRADEIN-IMEI' } } });
  expect(events.map((event) => event.type)).toEqual(
    expect.arrayContaining(['tradein.assessed', 'tradein.contracted']),
  );
});
