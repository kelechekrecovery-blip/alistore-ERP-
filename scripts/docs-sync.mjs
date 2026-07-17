#!/usr/bin/env node
// Counts the live architecture surfaces — API modules, web routes, Prisma
// migrations — and prints a paste-ready summary line for docs/READINESS.md so
// status docs are regenerated from code instead of drifting by hand.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Immediate subdirectories of apps/api/src that contain at least one *.module.ts. */
function countApiModules() {
  const srcDir = join(root, 'apps/api/src');
  return readdirSync(srcDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((dir) =>
      readdirSync(join(srcDir, dir.name)).some((file) => file.endsWith('.module.ts')),
    ).length;
}

/** Directories under apps/web/app (recursive) that contain a page.tsx; component-only folders are skipped. */
function countWebRoutes() {
  let routes = 0;
  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name === 'page.tsx')) routes += 1;
    for (const entry of entries) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
    }
  };
  walk(join(root, 'apps/web/app'));
  return routes;
}

/** Migration folders inside apps/api/prisma/migrations (migration_lock.toml is not a folder). */
function countPrismaMigrations() {
  return readdirSync(join(root, 'apps/api/prisma/migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).length;
}

/** Russian plural: pick the form matching the count (1 модуль, 3 модуля, 5 модулей). */
function plural(count, one, few, many) {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 > 10 && mod100 < 20) return many;
  if (mod10 > 1 && mod10 < 5) return few;
  if (mod10 === 1) return one;
  return many;
}

const apiModules = countApiModules();
const webRoutes = countWebRoutes();
const migrations = countPrismaMigrations();

console.log(`API modules (apps/api/src dirs with *.module.ts): ${apiModules}`);
console.log(`Web routes (apps/web/app dirs with page.tsx): ${webRoutes}`);
console.log(`Prisma migrations (apps/api/prisma/migrations): ${migrations}`);
console.log('\nPaste-ready line for docs/READINESS.md:');
console.log(
  `- **${apiModules} backend-${plural(apiModules, 'модуль', 'модуля', 'модулей')}** (NestJS) · `
  + `**${webRoutes} веб-${plural(webRoutes, 'роут', 'роута', 'роутов')}** (Next.js) · `
  + `**${migrations} ${plural(migrations, 'миграция', 'миграции', 'миграций')}**`,
);
