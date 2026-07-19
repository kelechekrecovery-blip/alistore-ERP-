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
  { name: 'erp-login', path: '/erp', noSession: true },
  { name: 'erp-dash', path: '/erp', click: 'button:has-text("Дашборд")' },
  { name: 'erp-stock', path: '/erp', click: 'button:has-text("Склад")' },
  { name: 'erp-finance', path: '/erp', click: 'button:has-text("Финансы")' },
  { name: 'erp-hr', path: '/erp', click: 'button:has-text("HR")' },
  { name: 'erp-logistics', path: '/erp', click: 'button:has-text("Логистика")' },
  { name: 'erp-operations', path: '/erp', click: 'button:has-text("Операции")' },
  { name: 'erp-service', path: '/erp', click: 'button:has-text("Сервис")' },
  { name: 'erp-kpi', path: '/erp', click: 'button:has-text("KPI")' },
  { name: 'erp-crm', path: '/erp', click: 'button:has-text("CRM")' },
  { name: 'erp-ai', path: '/erp', click: 'button:has-text("Ассистент")' },
  { name: 'erp-admin', path: '/erp', click: 'button:has-text("Администрирование")' },
  { name: 'approvals', path: '/approvals' },
  { name: 'warehouse', path: '/warehouse' },
  { name: 'staff', path: '/staff' },
  { name: 'admin-products', path: '/admin/products' },
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await context.newPage();

  for (const route of routes) {
    try {
      if (!route.noSession) {
        await page.goto(`${BASE}/erp`);
        await page.evaluate((s) => {
          localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(s));
        }, session);
      }
      await page.goto(`${BASE}${route.path}`);
      await sleep(500);
      if (route.click) {
        const el = await page.locator(route.click).first();
        if (await el.count() > 0) await el.click();
        await sleep(500);
      }
      await page.screenshot({ path: `${OUT}/${route.name}.png`, fullPage: false });
      console.log(`✓ ${route.name}.png`);
    } catch (error) {
      console.error(`✗ ${route.name}: ${error.message}`);
    }
  }

  await browser.close();
}

main();
