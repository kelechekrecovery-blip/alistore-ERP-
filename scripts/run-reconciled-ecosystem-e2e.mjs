#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveTrustedNpm, trustedNpmEnvironment } from './trusted-npm.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilePath = path.join(root, 'scripts', 'ecosystem-reconciliation-profile.json');
const packagePath = path.join(root, 'package.json');

if (process.argv.length !== 2) {
  console.error('The reconciled ecosystem profile does not accept partial-run arguments.');
  process.exit(2);
}

const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const steps = profile.steps;
const npm = resolveTrustedNpm(root);

if (profile.schemaVersion !== 1 || !Array.isArray(steps) || steps.length === 0) {
  console.error('Invalid ecosystem reconciliation profile.');
  process.exit(2);
}

const ids = new Set();
const packageScripts = new Set();
for (const step of steps) {
  if (
    !step ||
    typeof step.id !== 'string' ||
    !/^[a-z0-9-]+$/u.test(step.id) ||
    typeof step.packageScript !== 'string' ||
    !/^ecosystem:[a-z0-9-]+:e2e$/u.test(step.packageScript) ||
    ids.has(step.id) ||
    packageScripts.has(step.packageScript) ||
    !packageJson.scripts?.[step.packageScript]
  ) {
    console.error('Invalid or duplicate ecosystem reconciliation step.');
    process.exit(2);
  }
  ids.add(step.id);
  packageScripts.add(step.packageScript);
}

for (const [index, step] of steps.entries()) {
  console.log(`\n==> Reconciliation ${index + 1}/${steps.length}: ${step.id}`);
  const result = spawnSync(process.execPath, [npm.cliPath, 'run', step.packageScript], {
    cwd: root,
    env: trustedNpmEnvironment(npm),
    shell: false,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(`\nReconciled ecosystem profile failed at: ${step.id}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\nReconciled ecosystem software matrix passed (${steps.length}/${steps.length} verticals).`);
console.log('Physical devices, live providers, deep native journeys and missing visual handoffs remain separate release gates.');
