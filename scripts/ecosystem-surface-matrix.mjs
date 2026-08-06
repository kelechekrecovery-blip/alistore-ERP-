#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { summarizeRouteCoverage } from './cloudflare-route-coverage.mjs';

export const ALLOWED_CONTOURS = Object.freeze([
  'storefront', 'client', 'erp', 'staff', 'warehouse', 'pos', 'courier',
  'service', 'business', 'platform',
]);
export const ALLOWED_STATUSES = Object.freeze([
  'accepted', 'partial', 'placeholder', 'external', 'blocked',
]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'docs', 'acceptance', 'ecosystem-surface-matrix.json');
const reportPath = path.join(root, '.artifacts', 'ecosystem', 'surface-matrix-report.json');
const ROW_KEYS = Object.freeze([
  'id', 'contour', 'owner', 'surface', 'api', 'models', 'rbac', 'ledger',
  'acceptance', 'status', 'blockers',
]);
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const read = (projectRoot, relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const sorted = (values) => [...values].sort((left, right) => left.localeCompare(right));

function listFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(target, predicate);
    return entry.isFile() && predicate(target) ? [target] : [];
  });
}

function webRouteFromPage(projectRoot, pagePath) {
  const appRoot = path.join(projectRoot, 'apps', 'web', 'app');
  const relative = path.relative(appRoot, pagePath).split(path.sep).join('/');
  const route = relative.replace(/(?:^|\/)page\.tsx$/u, '');
  return `web:${route ? `/${route}` : '/'}`;
}

function collectIosSurfaces(projectRoot) {
  const source = read(projectRoot, 'apps/ios/project.yml');
  const lines = source.split(/\r?\n/u);
  const targetsStart = lines.findIndex((line) => line === 'targets:');
  if (targetsStart === -1) return [];
  const surfaces = [];
  for (let index = targetsStart + 1; index < lines.length; index += 1) {
    const target = lines[index].match(/^  ([A-Za-z][A-Za-z0-9]*):$/u)?.[1];
    if (!target) continue;
    let application = false;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^\S/u.test(lines[cursor]) || /^  [A-Za-z][A-Za-z0-9]*:$/u.test(lines[cursor])) break;
      if (/^ {4}type:\s*application\s*$/u.test(lines[cursor])) application = true;
    }
    if (application) surfaces.push(`ios:${target}`);
  }
  return sorted(surfaces);
}

function collectAndroidSurfaces(projectRoot) {
  const settings = read(projectRoot, 'apps/android/settings.gradle.kts');
  const modules = [...settings.matchAll(/['"]:([^'"]+)['"]/gu)].map((match) => match[1]);
  return sorted(modules.filter((module) => {
    const buildPath = path.join(projectRoot, 'apps', 'android', module, 'build.gradle.kts');
    return fs.existsSync(buildPath) && fs.readFileSync(buildPath, 'utf8').includes('android.application');
  }).map((module) => `android:${module}`));
}

function collectApiRoutes(projectRoot) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'alistore-controller-matrix-'));
  const output = path.join(temporaryRoot, 'matrix.json');
  try {
    const result = spawnSync(
      process.execPath,
      [path.join(projectRoot, 'scripts', 'cloudflare-api-contract-matrix.mjs'), '--output', output],
      { cwd: projectRoot, encoding: 'utf8' },
    );
    if (result.status !== 0) {
      throw new Error(`controller matrix failed: ${(result.stderr || result.stdout).trim()}`);
    }
    const matrix = JSON.parse(fs.readFileSync(output, 'utf8'));
    return sorted(matrix.endpoints.map(({ method, path: endpointPath }) => `${method} ${endpointPath}`));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export function collectInventory(projectRoot = root) {
  const webSurfaces = listFiles(
    path.join(projectRoot, 'apps', 'web', 'app'),
    (file) => file.endsWith(`${path.sep}page.tsx`),
  ).map((page) => webRouteFromPage(projectRoot, page));
  const schema = read(projectRoot, 'apps/api/prisma/schema.prisma');
  const eventSource = read(projectRoot, 'apps/api/src/audit/event-types.ts');
  const eventObject = eventSource.match(/export const EventType\s*=\s*\{([\s\S]*?)\}\s*as const/u)?.[1] ?? '';
  const packageJson = JSON.parse(read(projectRoot, 'package.json'));
  const authzRoot = path.join(projectRoot, 'apps', 'api', 'src', 'authz');

  return {
    webSurfaces: sorted(webSurfaces),
    iosSurfaces: collectIosSurfaces(projectRoot),
    androidSurfaces: collectAndroidSurfaces(projectRoot),
    apiRoutes: collectApiRoutes(projectRoot),
    models: sorted([...schema.matchAll(/^model\s+([A-Za-z][A-Za-z0-9]*)\s*\{/gmu)].map((match) => match[1])),
    events: sorted([...eventObject.matchAll(/:\s*'([^']+)'/gu)].map((match) => match[1])),
    packageCommands: sorted(Object.keys(packageJson.scripts ?? {})),
    files: sorted(listFiles(authzRoot, () => true).map((file) => path.relative(projectRoot, file).split(path.sep).join('/'))),
  };
}

function exactCoverage(requiredSurfaces, declaredSurfaces) {
  const coverage = summarizeRouteCoverage(
    requiredSurfaces.map((surface) => ({ method: 'SURFACE', path: surface })),
    declaredSurfaces.map((surface) => `SURFACE ${surface}`),
  );
  return {
    required: coverage.required,
    covered: coverage.covered,
    missing: coverage.missing.map((value) => value.replace(/^SURFACE /u, '')),
    unknown: coverage.unknown.map((value) => value.replace(/^SURFACE /u, '')),
  };
}

function issue(errors, code, message, rowId) {
  errors.push({ code, ...(rowId ? { rowId } : {}), message });
}

export function validateManifest(manifest, inventory) {
  const errors = [];
  const rows = Array.isArray(manifest?.rows) ? manifest.rows : [];
  if (manifest?.schemaVersion !== 1) issue(errors, 'invalid-schema-version', 'schemaVersion must be 1.');
  if (!Array.isArray(manifest?.rows)) issue(errors, 'invalid-rows', 'rows must be an array.');

  const ids = new Set();
  const surfaces = new Set();
  const knownApis = new Set(inventory.apiRoutes);
  const knownModels = new Set(inventory.models);
  const knownEvents = new Set(inventory.events);
  const knownCommands = new Set(inventory.packageCommands);
  const knownFiles = new Set(inventory.files);
  const allKnownSurfaces = new Set([
    ...inventory.webSurfaces, ...inventory.iosSurfaces, ...inventory.androidSurfaces,
  ]);

  for (const [index, candidate] of rows.entries()) {
    const row = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
    const rowId = typeof row.id === 'string' && row.id ? row.id : `row-${index + 1}`;
    const keys = Object.keys(row).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...ROW_KEYS].sort())) {
      issue(errors, 'invalid-row-shape', `Row must contain exactly: ${ROW_KEYS.join(', ')}.`, rowId);
    }
    if (typeof row.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(row.id)) {
      issue(errors, 'invalid-id', 'id must be a non-empty kebab-case string.', rowId);
    } else if (ids.has(row.id)) {
      issue(errors, 'duplicate-id', `Duplicate row id: ${row.id}.`, rowId);
    }
    ids.add(row.id);
    if (!ALLOWED_CONTOURS.includes(row.contour)) issue(errors, 'invalid-contour', `Invalid contour: ${row.contour}.`, rowId);
    if (!ALLOWED_STATUSES.includes(row.status)) issue(errors, 'invalid-status', `Invalid status: ${row.status}.`, rowId);
    if (typeof row.owner !== 'string' || row.owner.trim() === '') issue(errors, 'empty-owner', 'owner must be non-empty.', rowId);
    if (typeof row.surface !== 'string' || !allKnownSurfaces.has(row.surface)) {
      issue(errors, 'unknown-surface', `Unknown surface: ${row.surface}.`, rowId);
    } else if (surfaces.has(row.surface)) {
      issue(errors, 'duplicate-surface', `Surface is owned more than once: ${row.surface}.`, rowId);
    }
    if (typeof row.surface === 'string') surfaces.add(row.surface);

    for (const field of ['api', 'models', 'rbac', 'ledger', 'acceptance', 'blockers']) {
      if (!Array.isArray(row[field]) || row[field].some((value) => typeof value !== 'string' || value.trim() === '')) {
        issue(errors, 'invalid-field', `${field} must be an array of non-empty strings.`, rowId);
      }
    }
    const api = Array.isArray(row.api) ? row.api : [];
    const models = Array.isArray(row.models) ? row.models : [];
    const rbac = Array.isArray(row.rbac) ? row.rbac : [];
    const ledger = Array.isArray(row.ledger) ? row.ledger : [];
    const acceptance = Array.isArray(row.acceptance) ? row.acceptance : [];
    const blockers = Array.isArray(row.blockers) ? row.blockers : [];
    for (const value of api) if (!knownApis.has(value)) issue(errors, 'unknown-api-route', `Unknown API route: ${value}.`, rowId);
    for (const value of models) if (!knownModels.has(value)) issue(errors, 'unknown-model', `Unknown Prisma model: ${value}.`, rowId);
    for (const value of ledger) if (!knownEvents.has(value)) issue(errors, 'unknown-ledger-event', `Unknown Ledger event: ${value}.`, rowId);
    for (const value of acceptance) if (!knownCommands.has(value)) issue(errors, 'unknown-package-command', `Unknown package command: ${value}.`, rowId);
    for (const value of rbac) if (!knownFiles.has(value)) issue(errors, 'unknown-rbac-reference', `Unknown RBAC source/policy reference: ${value}.`, rowId);
    if (['external', 'blocked'].includes(row.status) && blockers.length === 0) issue(errors, 'missing-blocker', `${row.status} rows require a blocker.`, rowId);
    if (row.status === 'accepted' && acceptance.length === 0) issue(errors, 'missing-acceptance', 'accepted rows require acceptance evidence.', rowId);
    const hasCriticalMutation = api.some((value) => MUTATION_METHODS.has(value.split(' ', 1)[0]));
    if (hasCriticalMutation && ledger.length === 0) {
      issue(errors, 'critical-mutation-without-ledger', 'A row declaring a mutation must declare at least one catalogued Ledger event.', rowId);
    }
  }

  const declared = rows.map((row) => row?.surface).filter((surface) => typeof surface === 'string');
  const coverage = {
    web: exactCoverage(inventory.webSurfaces, declared.filter((surface) => surface.startsWith('web:'))),
    ios: exactCoverage(inventory.iosSurfaces, declared.filter((surface) => surface.startsWith('ios:'))),
    android: exactCoverage(inventory.androidSurfaces, declared.filter((surface) => surface.startsWith('android:'))),
  };
  for (const family of ['web', 'ios', 'android']) {
    for (const surface of coverage[family].missing) issue(errors, `orphaned-${family}-surface`, `No owner row for ${surface}.`);
  }
  coverage.total = {
    required: coverage.web.required + coverage.ios.required + coverage.android.required,
    covered: coverage.web.covered + coverage.ios.covered + coverage.android.covered,
    missing: [...coverage.web.missing, ...coverage.ios.missing, ...coverage.android.missing],
    unknown: [...coverage.web.unknown, ...coverage.ios.unknown, ...coverage.android.unknown],
  };

  return {
    valid: errors.length === 0,
    rowCount: rows.length,
    coverage,
    references: {
      api: rows.reduce((count, row) => count + (Array.isArray(row?.api) ? row.api.length : 0), 0),
      models: rows.reduce((count, row) => count + (Array.isArray(row?.models) ? row.models.length : 0), 0),
      rbac: rows.reduce((count, row) => count + (Array.isArray(row?.rbac) ? row.rbac.length : 0), 0),
      ledger: rows.reduce((count, row) => count + (Array.isArray(row?.ledger) ? row.ledger.length : 0), 0),
      acceptance: rows.reduce((count, row) => count + (Array.isArray(row?.acceptance) ? row.acceptance.length : 0), 0),
    },
    errors,
  };
}

export function run({ projectRoot = root, strict = false } = {}) {
  const source = JSON.parse(fs.readFileSync(path.join(projectRoot, path.relative(root, manifestPath)), 'utf8'));
  const report = {
    generatedAt: new Date().toISOString(),
    source: 'docs/acceptance/ecosystem-surface-matrix.json',
    ledgerAssertion: 'Catalog reference integrity only; service-level emission requires runtime acceptance evidence.',
    ...validateManifest(source, collectInventory(projectRoot)),
  };
  const output = path.join(projectRoot, path.relative(root, reportPath));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${report.valid ? '✓' : '✗'} ${report.rowCount} ecosystem rows; ${report.coverage.total.covered}/${report.coverage.total.required} surfaces covered.`);
  console.log(`Report: ${output}`);
  for (const error of report.errors) console.error(`✗ ${error.code}${error.rowId ? ` [${error.rowId}]` : ''}: ${error.message}`);
  if (strict && !report.valid) process.exitCode = 1;
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run({ strict: process.argv.includes('--strict') });
}
