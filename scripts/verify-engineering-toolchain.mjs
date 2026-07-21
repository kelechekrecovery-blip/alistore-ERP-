import { execFileSync } from 'node:child_process';

const packageChecks = [
  ['fast-check', () => import('fast-check')],
  ['testcontainers', () => import('testcontainers')],
  ['axe-playwright', () => import('@axe-core/playwright')],
];

const cliChecks = [
  ['spec-kit', 'specify', ['--version'], true],
  ['serena', 'serena', ['--version'], true],
  ['schemathesis', 'schemathesis', ['--version'], true],
  ['toxiproxy', 'toxiproxy-server', ['--version'], true],
  ['gitleaks', 'gitleaks', ['version'], true],
  ['osv-scanner', 'osv-scanner', ['--version'], true],
  ['k6', 'k6', ['version'], true],
  ['semgrep', 'semgrep', ['--version'], false],
  ['trivy', 'trivy', ['--version'], false],
  ['maestro', 'maestro', ['--version'], false],
];

const results = [];
let failed = false;

for (const [name, load] of packageChecks) {
  try {
    await load();
    results.push({ name, kind: 'package', status: 'ready' });
  } catch (error) {
    failed = true;
    results.push({ name, kind: 'package', status: 'missing', detail: error.message });
  }
}

for (const [name, executable, args, required] of cliChecks) {
  try {
    const output = execFileSync(executable, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    }).trim();
    results.push({ name, kind: 'cli', status: 'ready', version: output.split('\n')[0] });
  } catch (error) {
    if (required) failed = true;
    results.push({
      name,
      kind: 'cli',
      status: required ? 'missing' : 'optional-missing',
      detail: error.code ?? error.message,
    });
  }
}

console.table(results.map(({ detail: _detail, ...result }) => result));

if (failed) {
  console.error('Required AliStore engineering tools are missing.');
  process.exitCode = 1;
}
