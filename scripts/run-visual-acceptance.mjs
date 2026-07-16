#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
const expectedTitles = [
  'ERP desktop visual baseline',
  'storefront desktop visual baseline',
  'storefront mobile visual baseline',
].sort();

if (process.argv.length !== 2 || !fs.existsSync(cliPath)) {
  console.error('Visual acceptance runner takes no arguments and requires the locked Playwright CLI.');
  process.exit(2);
}

const run = spawnSync(
  process.execPath,
  [cliPath, 'test', 'e2e/visual-acceptance.spec.ts', '--reporter=json'],
  {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  },
);

if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0 || run.error) {
  if (run.stdout) process.stdout.write(run.stdout);
  console.error(run.error?.message ?? `Visual Playwright run exited ${run.status ?? 'without status'}.`);
  process.exit(run.status ?? 1);
}

let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error('Visual Playwright run did not return a valid JSON report.');
  process.exit(1);
}

const specs = [];
const visit = (suite) => {
  for (const spec of suite.specs ?? []) specs.push(spec);
  for (const child of suite.suites ?? []) visit(child);
};
for (const suite of report.suites ?? []) visit(suite);

const actualTitles = specs.map((spec) => spec.title).sort();
const exactTitles = JSON.stringify(actualTitles) === JSON.stringify(expectedTitles);
const everyTestPassed = specs.every((spec) =>
  spec.ok === true &&
  spec.tests?.length === 1 &&
  spec.tests[0].expectedStatus === 'passed' &&
  spec.tests[0].results?.length === 1 &&
  spec.tests[0].results[0].status === 'passed',
);
const stats = report.stats ?? {};
const exactStats =
  stats.expected === expectedTitles.length &&
  stats.unexpected === 0 &&
  stats.flaky === 0 &&
  stats.skipped === 0;

if (!exactTitles || !everyTestPassed || !exactStats || (report.errors ?? []).length !== 0) {
  console.error('Visual acceptance requires exactly three expected passed tests with no skipped, flaky or interrupted result.');
  process.exit(1);
}

console.log(`Visual acceptance passed ${expectedTitles.length}/${expectedTitles.length} exact screenshot tests.`);
