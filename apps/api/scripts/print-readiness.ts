import { config } from 'dotenv';
import { resolve } from 'node:path';
import { buildExternalReadinessReport } from '../src/health/external-readiness';

config({ path: resolve(__dirname, '../.env') });

const strictExternal = process.argv.includes('--strict-external');
const report = buildExternalReadinessReport((name) => process.env[name]);

console.log(`External readiness: ${report.status}`);
console.log(
  `Summary: ready=${report.summary.ready}, missing=${report.summary.missing}, manual=${report.summary.manualRequired}, optional=${report.summary.optional}, blocking=${report.summary.blockingRemaining}`,
);

for (const check of report.checks) {
  const marker = check.status === 'ready' ? 'OK' : check.blocking ? 'BLOCKED' : 'OPTIONAL';
  const missing = check.missingEnv.length ? ` missing=${check.missingEnv.join(',')}` : '';
  const configured = check.configuredEnv.length ? ` configured=${check.configuredEnv.join(',')}` : '';
  console.log(`- [${marker}] ${check.id}: ${check.status}.${missing}${configured}`);
  if (check.status !== 'ready') {
    console.log(`  ${check.note}`);
    for (const manual of check.manualChecks) {
      console.log(`  manual: ${manual}`);
    }
  }
}

if (strictExternal && report.status !== 'ready') {
  process.exit(1);
}
