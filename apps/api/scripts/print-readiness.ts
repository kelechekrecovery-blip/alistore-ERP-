import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildExternalReadinessReport } from '../src/health/external-readiness';

interface Args {
  envFile?: string;
  json: boolean;
  strictExternal: boolean;
}

const args = parseArgs(process.argv.slice(2));
const envFile = args.envFile
  ? resolve(process.cwd(), args.envFile)
  : resolve(__dirname, '../.env');

if (args.envFile && !existsSync(envFile)) {
  console.error(`Readiness env file not found: ${envFile}`);
  process.exit(1);
}

config({ path: envFile });
const report = buildExternalReadinessReport((name) => process.env[name]);

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printTextReport(report, envFile);
}

if (args.strictExternal && report.status !== 'ready') {
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    json: false,
    strictExternal: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--strict-external') {
      parsed.strictExternal = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--env-file') {
      const value = argv[i + 1];
      if (!value) {
        console.error('--env-file requires a path');
        process.exit(1);
      }
      parsed.envFile = value;
      i += 1;
    }
  }
  return parsed;
}

function printTextReport(
  report: ReturnType<typeof buildExternalReadinessReport>,
  envFile: string,
) {
  console.log(`Readiness env file: ${envFile}`);
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
}
