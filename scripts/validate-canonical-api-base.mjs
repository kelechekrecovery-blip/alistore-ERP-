#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  hasProductionRoute,
  projectRoot,
  readWranglerConfig,
} from './cloudflare-config.mjs';

export const cutoverApiBase = 'https://ali.kg/api';
export const legacyApiBase = 'https://api.ali.kg/api';
export const requiredApiBaseFiles = Object.freeze([
  'apps/android/README.md',
  'scripts/com.alistore.web.plist',
  'scripts/public-demo-up.sh',
]);

export function expectedApiBase(wranglerSource) {
  return hasProductionRoute(wranglerSource) ? cutoverApiBase : legacyApiBase;
}

export function findApiBaseMismatches(wranglerSource, readSource) {
  const expected = expectedApiBase(wranglerSource);
  return {
    expected,
    failures: requiredApiBaseFiles.filter((relative) => !readSource(relative).includes(expected)),
  };
}

function main() {
  const { expected, failures } = findApiBaseMismatches(
    readWranglerConfig(),
    (relative) => fs.readFileSync(path.join(projectRoot, relative), 'utf8'),
  );

  if (failures.length > 0) {
    console.error(`✗ Expected API base ${expected} is missing from: ${failures.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ Production client configuration matches the active route phase: ${expected}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
