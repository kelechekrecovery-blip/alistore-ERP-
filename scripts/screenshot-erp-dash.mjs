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
  await sleep(800);
  await page.screenshot({ path: `${OUT}/erp-dash-after.png`, fullPage: false });
  console.log(`✓ erp-dash-after.png`);

  await browser.close();
}

main();
