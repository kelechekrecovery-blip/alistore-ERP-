import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildProductionPreflightReport } from '../src/health/production-preflight';

interface Args {
  envFile?: string;
  json: boolean;
  strict: boolean;
}

const args = parseArgs(process.argv.slice(2));
const envFile = args.envFile
  ? resolve(process.cwd(), args.envFile)
  : resolve(__dirname, '../.env.production');

if (!existsSync(envFile)) {
  console.error(`Production preflight env file not found: ${envFile}`);
  process.exit(1);
}

config({ path: envFile, override: true });
const report = buildProductionPreflightReport((name) => process.env[name]);

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printTextReport(report, envFile);
}

if (args.strict && report.status !== 'ready') {
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    json: false,
    strict: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--strict') {
      parsed.strict = true;
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
  report: ReturnType<typeof buildProductionPreflightReport>,
  envFile: string,
) {
  console.log(`Production preflight env file: ${envFile}`);
  console.log(`Production preflight: ${report.status}`);
  console.log(
    `Summary: ready=${report.summary.ready}, missing=${report.summary.missing}, unsafe=${report.summary.unsafe}, blocking=${report.summary.blockingRemaining}`,
  );

  for (const check of report.checks) {
    const marker = check.status === 'ready' ? 'OK' : 'BLOCKED';
    const missing = check.missingEnv.length ? ` missing=${check.missingEnv.join(',')}` : '';
    const configured = check.configuredEnv.length ? ` configured=${check.configuredEnv.join(',')}` : '';
    console.log(`- [${marker}] ${check.id}: ${check.status}.${missing}${configured}`);
    if (check.status !== 'ready') {
      console.log(`  ${check.note}`);
    }
  }
}
