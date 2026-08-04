import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const OUT = process.argv[2] || 'docs';

const session = {
  accessToken: 'fake-token-for-baseline-screenshots',
  staffId: 'baseline-owner',
  username: 'baseline-owner',
  role: 'owner',
  totpEnabled: false,
};

const routes = [
  { name: 'erp-dash', label: 'Дашборд' },
  { name: 'erp-stock', label: 'Склад' },
  { name: 'erp-finance', label: 'Финансы' },
  { name: 'erp-tasks', label: 'Задачи' },
  { name: 'erp-kpi', label: 'KPI и ЗП' },
  { name: 'erp-crm', label: 'CRM' },
  { name: 'erp-ai', label: 'AI-ассистент' },
  { name: 'erp-hr', label: 'HR' },
  { name: 'erp-logistics', label: 'Логистика' },
  { name: 'erp-operations', label: 'Операции точки' },
  { name: 'erp-service', label: 'Сервис-центр' },
  { name: 'erp-reorder', label: 'Закупки' },
  { name: 'erp-storefront', label: 'Сайт' },
  { name: 'erp-admin', label: 'Администрирование' },
  { name: 'erp-risks', label: 'Риски' },
  { name: 'erp-readiness', label: 'Готовность' },
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/erp`);
  await page.evaluate((s) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(s));
  }, session);
  await page.goto(`${BASE}/erp`);
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/erp-shell-after.png`, fullPage: false });
  console.log('✓ erp-shell-after.png');

  for (const route of routes) {
    const button = page.locator('aside nav button', { hasText: route.label }).first();
    if (await button.count() > 0) {
      await button.click();
      await sleep(800);
    }
    await page.screenshot({ path: `${OUT}/${route.name}-after.png`, fullPage: false });
    console.log(`✓ ${route.name}-after.png`);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
