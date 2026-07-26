#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from './cloudflare-config.mjs';

const canonical = 'https://ali.kg/api';
// The iOS release files (apps/ios/.env.production.example, store/release-runbook.md)
// are deliberately absent from this list. They configure builds that ship to the
// App Store, so they must name the host that serves the API right now —
// https://api.ali.kg/api — and `https://ali.kg/api` still answers 404 until the
// Cloudflare Functions migration is deployed. Add them back at cutover.
const requiredFiles = [
  'apps/mobile/.env.production.example',
  'apps/android/README.md',
  'scripts/com.alistore.web.plist',
  'scripts/public-demo-up.sh',
];
const failures = requiredFiles.filter((relative) => (
  !fs.readFileSync(path.join(projectRoot, relative), 'utf8').includes(canonical)
));

if (failures.length > 0) {
  console.error(`✗ Canonical API base is missing from: ${failures.join(', ')}`);
  process.exit(1);
}
console.log(`✓ Production client configuration uses ${canonical}`);
