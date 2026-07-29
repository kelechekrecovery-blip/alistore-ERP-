#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from './cloudflare-config.mjs';

const controllerRoot = path.join(projectRoot, 'apps', 'api', 'src');
const outputArgIndex = process.argv.indexOf('--output');
const outputPath = outputArgIndex === -1
  ? path.join(projectRoot, '.artifacts', 'cloudflare', 'api-contract-matrix.json')
  : path.resolve(process.argv[outputArgIndex + 1] ?? '');

function listControllers(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listControllers(target);
    return entry.isFile() && entry.name.endsWith('.controller.ts') ? [target] : [];
  });
}

function decoratorValue(raw = '') {
  const match = raw.match(/^\s*['"`]([^'"`]*)['"`]\s*$/);
  return match?.[1] ?? '';
}

function normalizeRoute(prefix, route) {
  return `/api/${[prefix, route].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
}

const endpoints = [];
for (const file of listControllers(controllerRoot)) {
  const source = fs.readFileSync(file, 'utf8');
  const controllers = [...source.matchAll(/@Controller\(([^)]*)\)/g)];
  for (const [index, controller] of controllers.entries()) {
    const prefix = decoratorValue(controller[1]);
    const segmentStart = controller.index ?? 0;
    const segmentEnd = controllers[index + 1]?.index ?? source.length;
    const segment = source.slice(segmentStart, segmentEnd);
    const routePattern = /@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/g;
    for (const match of segment.matchAll(routePattern)) {
      const method = match[1].toUpperCase();
      const route = decoratorValue(match[2]);
      const decoratorContext = segment.slice(Math.max(0, (match.index ?? 0) - 500), match.index);
      const rolesBlock = decoratorContext.match(/@Roles\(([^)]*)\)\s*$/);
      const roles = rolesBlock
        ? [...rolesBlock[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((item) => item[1])
        : [];
      endpoints.push({
        method,
        path: normalizeRoute(prefix, route),
        roles,
        public: /@Public\(\)\s*$/.test(decoratorContext),
        source: path.relative(projectRoot, file),
      });
    }
  }
}

endpoints.sort((left, right) => (
  left.path.localeCompare(right.path) || left.method.localeCompare(right.method)
));
const duplicateKeys = endpoints
  .map((endpoint) => `${endpoint.method} ${endpoint.path}`)
  .filter((key, index, all) => all.indexOf(key) !== index);
const matrix = {
  generatedAt: new Date().toISOString(),
  source: 'NestJS controller decorators',
  endpointCount: endpoints.length,
  duplicateKeys: [...new Set(duplicateKeys)],
  endpoints,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(matrix, null, 2)}\n`);
console.log(`✓ ${endpoints.length} API contracts written to ${outputPath}`);
if (matrix.duplicateKeys.length > 0) {
  console.error(`✗ Duplicate API contracts: ${matrix.duplicateKeys.join(', ')}`);
  process.exit(1);
}
