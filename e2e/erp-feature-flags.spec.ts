import { expect, test } from '@playwright/test';
import { API_BASE, prisma, resetDb, seedStaffCredentials } from './helpers';

const KEY = 'supply.to_order_checkout';

test.afterEach(async () => {
  await prisma.featureFlagOverride.deleteMany();
  await resetDb();
});

test('admin is read-only and owner override/reset is reflected without restart', async ({ page, request }) => {
  await resetDb();
  await prisma.featureFlagOverride.deleteMany();
  const admin = await seedStaffCredentials('admin', 'e2e-feature-flags-admin');
  const owner = await seedStaffCredentials('owner', 'e2e-feature-flags-owner');

  await page.goto('/erp');
  await page.evaluate((session) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(session));
  }, staffSession(admin, 'admin'));
  await page.goto('/erp?route=feature_flags');

  await expect(page.getByTestId('feature-flags-view')).toBeVisible();
  await expect(page.getByText('Только чтение: требуется permission settings:manage.')).toBeVisible();
  const adminRow = page.getByTestId(`feature-flag-${KEY}`);
  await expect(adminRow.getByLabel(`Причина ${KEY}`)).toBeDisabled();
  await expect(adminRow.getByRole('button', { name: 'Выключить' })).toBeDisabled();
  const forbidden = await request.patch(`${API_BASE}/feature-flags/${KEY}`, {
    headers: { authorization: `Bearer ${admin.accessToken}` },
    data: { enabled: false, reason: 'Admin must remain read-only', expectedRevision: null },
  });
  expect(forbidden.status()).toBe(403);

  await page.evaluate((session) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(session));
  }, staffSession(owner, 'owner'));
  await page.reload();

  const ownerRow = page.getByTestId(`feature-flag-${KEY}`);
  await expect(ownerRow).toContainText('deploy env');
  await expect(ownerRow).toContainText('включён');

  const otherTab = await request.patch(`${API_BASE}/feature-flags/${KEY}`, {
    headers: { authorization: `Bearer ${owner.accessToken}` },
    data: { enabled: false, reason: 'Simulate a newer owner tab', expectedRevision: null },
  });
  expect(otherTab.status()).toBe(200);
  await ownerRow.getByLabel(`Причина ${KEY}`).fill('Pause to-order checkout for E2E verification');
  await ownerRow.getByRole('button', { name: 'Выключить' }).click();
  await expect(page.getByRole('dialog', { name: 'Подтвердите изменение' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Подтвердить' }).click();

  await expect(page.getByText('Флаг уже изменён в другой вкладке. Состояние обновлено — проверьте его и подтвердите заново.')).toBeVisible();
  await expect(ownerRow).toContainText('override базы');
  await expect(ownerRow).toContainText('выключен');

  await ownerRow.getByLabel(`Причина ${KEY}`).fill('Restore deploy policy after stale-tab verification');
  await ownerRow.getByRole('button', { name: 'Сбросить к deploy default' }).click();
  await expect(page.getByRole('dialog')).toContainText('Сброс отключит override и ВКЛЮЧИТ флаг через deploy env.');
  await page.getByRole('dialog').getByRole('button', { name: 'Подтвердить' }).click();
  await expect(ownerRow).toContainText('deploy env');
  await expect(ownerRow).toContainText('включён');

  await ownerRow.getByLabel(`Причина ${KEY}`).fill('Pause to-order checkout after stale-tab verification');
  await ownerRow.getByRole('button', { name: 'Выключить' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Подтвердить' }).click();

  await expect(ownerRow).toContainText('override базы');
  await expect(ownerRow).toContainText('выключен');
  await expect(page.getByText('Override применён без перезапуска')).toBeVisible();

  const operations = await request.get(`${API_BASE}/procurement/supply-operations`, {
    headers: { authorization: `Bearer ${owner.accessToken}` },
  });
  expect(operations.status()).toBe(200);
  const operationsReport = await operations.json();
  expect(operationsReport).not.toHaveProperty('flags');
  expect(operationsReport.capabilities.toOrderCheckoutEnabled).toBe(false);

  await ownerRow.getByLabel(`Причина ${KEY}`).fill('Restore deploy policy after E2E verification');
  await ownerRow.getByRole('button', { name: 'Сбросить к deploy default' }).click();
  await expect(page.getByRole('dialog')).toContainText('Сброс отключит override и ВКЛЮЧИТ флаг через deploy env.');
  await page.getByRole('dialog').getByRole('button', { name: 'Подтвердить' }).click();

  await expect(ownerRow).toContainText('deploy env');
  await expect(ownerRow).toContainText('включён');
  await expect(page.getByText('Deploy-политика восстановлена')).toBeVisible();
  expect(await prisma.featureFlagOverride.findUnique({ where: { key: KEY } }))
    .toMatchObject({ active: false, revision: 4 });

  const finalStateResponse = await request.get(`${API_BASE}/feature-flags`, {
    headers: { authorization: `Bearer ${owner.accessToken}` },
  });
  expect(finalStateResponse.status()).toBe(200);
  expect((await finalStateResponse.json()).find((flag: { key: string }) => flag.key === KEY))
    .toMatchObject({ source: 'environment', overrideActive: false, overrideRevision: 4 });
});

function staffSession(
  staff: Awaited<ReturnType<typeof seedStaffCredentials>>,
  role: 'admin' | 'owner',
) {
  return {
    accessToken: staff.accessToken,
    staffId: staff.staffId,
    username: staff.username,
    role,
    totpEnabled: false,
  };
}
