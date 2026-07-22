import { expect, test, type Page } from '@playwright/test';
import { sign } from 'jsonwebtoken';
import { prisma, resetDb } from './helpers';

const OWNER_ID = 'visual-acceptance-owner';

async function seedVisualState() {
  await resetDb();
  const product = await prisma.product.create({
    data: {
      sku: 'VISUAL-IPHONE-15-PRO',
      name: 'iPhone 15 Pro 256 GB',
      price: 124_990,
      cost: 96_000,
      category: 'phones',
      attrs: {},
    },
  });
  await prisma.deviceUnit.create({
    data: {
      imei: 'VISUAL-IPHONE-15-PRO-IMEI',
      productId: product.id,
      status: 'in_stock',
      location: 'BISHKEK-1',
    },
  });
  await prisma.staffUser.create({
    data: {
      id: OWNER_ID,
      username: 'visual.owner',
      passwordHash: 'visual-acceptance-not-for-login',
      role: 'owner',
    },
  });
}

async function settlePage(page: Page) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  const copyright = page.getByText(/© \d{4} AliStore/);
  if (await copyright.count()) {
    await copyright.evaluate((element) => {
      element.textContent = '© 2026 AliStore · Электроника · Кыргызстан';
    });
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
}

test.beforeEach(async () => seedVisualState());
test.afterEach(async () => resetDb());

test('storefront desktop visual baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Техника с гарантией. Новое и Б/У.' })).toBeVisible();
  await expect(page.getByRole('article').getByText('iPhone 15 Pro 256 GB', { exact: true })).toBeVisible();
  await settlePage(page);
  await expect(page).toHaveScreenshot('storefront-desktop.png', {
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
    maxDiffPixelRatio: 0.05,
  });
});

test('storefront mobile visual baseline', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 858 });
  await page.goto('/');
  await expect(page.locator('.md\\:hidden').getByText('Техника с гарантией. Новое и Б/У.', { exact: true })).toBeVisible();
  await settlePage(page);
  await expect(page).toHaveScreenshot('storefront-mobile.png', {
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
    maxDiffPixelRatio: 0.05,
  });
});

test('ERP desktop visual baseline', async ({ page }) => {
  const accessToken = sign(
    { sub: OWNER_ID, role: 'owner', typ: 'staff' },
    'dev-secret-alistore-local',
    { expiresIn: '8h' },
  );
  await page.addInitScript((session) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(session));
  }, {
    accessToken,
    staffId: OWNER_ID,
    username: 'visual.owner',
    role: 'owner',
    totpEnabled: false,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/erp');
  await expect(page.getByText('AliStore ERP', { exact: true })).toBeVisible();
  await settlePage(page);
  await expect(page).toHaveScreenshot('erp-desktop.png', {
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
    mask: [
      page.locator('.h-40'),
      page.getByTestId('dashboard-revenue-chart'),
      page.locator('[data-testid="kpi-metric"]'),
      page.locator('[data-testid="risk-decision"]'),
    ],
    maskColor: '#181510',
  });
});
