import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const routes = ['/', '/catalog', '/cart', '/checkout', '/login'];

for (const route of routes) {
  test(`critical accessibility violations: ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });
    const report = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();

    const blocking = report.violations.filter(({ impact }) =>
      impact === 'critical' || impact === 'serious',
    );
    expect(blocking).toEqual([]);
  });
}
