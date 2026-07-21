import { resolveAllowedHosts, resolveCorsOptions } from '../config/runtime-security';

export type ProductionPreflightStatus = 'ready' | 'missing' | 'unsafe';

export interface ProductionPreflightCheck {
  id: string;
  area: string;
  title: string;
  status: ProductionPreflightStatus;
  blocking: boolean;
  requiredEnv: string[];
  configuredEnv: string[];
  missingEnv: string[];
  note: string;
}

export interface ProductionPreflightReport {
  status: 'ready' | 'blocked';
  generatedAt: string;
  summary: {
    ready: number;
    missing: number;
    unsafe: number;
    blockingRemaining: number;
  };
  checks: ProductionPreflightCheck[];
  nextActions: string[];
}

type EnvReader = (name: string) => string | undefined;

interface CheckDefinition {
  id: string;
  area: string;
  title: string;
  requiredEnv: string[];
  note: string;
  evaluate?: (env: EnvReader) => ProductionPreflightStatus;
}

const WEAK_JWT_SECRETS = new Set([
  'dev-insecure-change-me',
  'change-me',
  'change-me-please',
  'changeme',
  'secret',
  'jwt-secret',
  'real-secret',
  'password',
]);

const CHECKS: CheckDefinition[] = [
  {
    id: 'node_env',
    area: 'runtime',
    title: 'Production runtime mode',
    requiredEnv: ['NODE_ENV'],
    note: 'Set NODE_ENV=production for optimized Nest/Node behavior and production guards.',
    evaluate: (env) => (env('NODE_ENV') === 'production' ? 'ready' : 'unsafe'),
  },
  {
    id: 'database_url',
    area: 'database',
    title: 'Production database URL',
    requiredEnv: ['DATABASE_URL'],
    note: 'DATABASE_URL must point at the production PostgreSQL database.',
  },
  {
    id: 'cors_origins',
    area: 'security',
    title: 'Production CORS allowlist',
    requiredEnv: ['CORS_ORIGINS'],
    note: 'Set exact HTTPS storefront/admin origins separated by commas; wildcard and empty production CORS are rejected.',
    evaluate: (env) => {
      try {
        resolveCorsOptions(env);
        return 'ready';
      } catch {
        return 'unsafe';
      }
    },
  },
  {
    id: 'allowed_hosts',
    area: 'security',
    title: 'Production host allowlist',
    requiredEnv: ['ALLOWED_HOSTS'],
    note: 'Set exact public API hostnames; localhost, URLs and direct Render origin hostnames are rejected.',
    evaluate: (env) => {
      try {
        const hosts = resolveAllowedHosts(env);
        return hosts.some((host) => host.endsWith('.onrender.com')) ? 'unsafe' : 'ready';
      } catch {
        return 'unsafe';
      }
    },
  },
  {
    id: 'jwt_secret',
    area: 'auth',
    title: 'Strong JWT secret',
    requiredEnv: ['JWT_SECRET'],
    note: 'JWT_SECRET must be a non-placeholder secret of at least 32 characters.',
    evaluate: (env) => {
      const secret = env('JWT_SECRET')?.trim() ?? '';
      if (!secret) return 'missing';
      if (secret.length < 32 || WEAK_JWT_SECRETS.has(secret)) return 'unsafe';
      return 'ready';
    },
  },
  {
    id: 'otp_dev_echo',
    area: 'auth',
    title: 'OTP dev echo disabled',
    requiredEnv: ['AUTH_OTP_DEV_ECHO'],
    note: 'AUTH_OTP_DEV_ECHO must be false so OTP codes are never returned in API responses.',
    evaluate: (env) => {
      const value = env('AUTH_OTP_DEV_ECHO')?.trim().toLowerCase();
      if (!value) return 'missing';
      return value === 'false' ? 'ready' : 'unsafe';
    },
  },
  {
    id: 'reservation_sweep',
    area: 'jobs',
    title: 'Reservation expiry sweep enabled',
    requiredEnv: ['RESERVATION_SWEEP_ENABLED'],
    note: 'RESERVATION_SWEEP_ENABLED=true keeps expired holds from locking stock.',
    evaluate: (env) => boolReady(env, 'RESERVATION_SWEEP_ENABLED'),
  },
  {
    id: 'outbox_relay',
    area: 'jobs',
    title: 'Outbox relay enabled',
    requiredEnv: ['OUTBOX_RELAY_ENABLED'],
    note: 'OUTBOX_RELAY_ENABLED=true lets transactional notifications and webhooks leave the durable outbox.',
    evaluate: (env) => boolReady(env, 'OUTBOX_RELAY_ENABLED'),
  },
  {
    id: 'refund_relay',
    area: 'jobs',
    title: 'Refund execution relay matches payment mode',
    requiredEnv: ['PROCESS_ROLE', 'REFUND_RELAY_ENABLED', 'PUBLIC_DEMO_MODE', 'PAYMENT_PROVIDER', 'PAYMENT_PROVIDER_CERTIFIED'],
    note: 'The API must keep the refund relay disabled; the worker runs it for sandbox/demo. Live execution stays blocked until the production refund adapter is implemented and certified.',
    evaluate: (env) => {
      const role = env('PROCESS_ROLE')?.trim().toLowerCase();
      const relay = env('REFUND_RELAY_ENABLED')?.trim().toLowerCase();
      const demo = env('PUBLIC_DEMO_MODE')?.trim().toLowerCase();
      const provider = env('PAYMENT_PROVIDER')?.trim().toLowerCase();
      const certified = env('PAYMENT_PROVIDER_CERTIFIED')?.trim().toLowerCase();
      if (demo === 'true' && provider === 'sandbox' && certified === 'false') {
        if (role === 'api') return relay === 'false' ? 'ready' : 'unsafe';
        if (role === 'worker') return relay === 'true' ? 'ready' : 'unsafe';
      }
      // Боевой магазин с оплатой только при получении. Провайдерских возвратов
      // здесь не существует физически: деньги приходят наличными курьеру или на
      // кассе, а возврат наличных идёт через домен `refunds`. Поэтому релей
      // обязан быть выключен у обеих ролей — включённым он небезопасен.
      //
      // Без этой ветки выключение демо-режима не запускало магазин, а гасило
      // его: assertProductionRuntimeReady бросает на любой непройденной
      // проверке, и «настоящий магазин без платёжного шлюза» был недостижим.
      if (provider === 'none') return relay === 'false' ? 'ready' : 'unsafe';
      return 'unsafe';
    },
  },
  {
    id: 'bullmq_runtime',
    area: 'jobs',
    title: 'BullMQ Redis runtime configured',
    requiredEnv: ['JOB_BACKEND', 'REDIS_URL'],
    note: 'JOB_BACKEND=bullmq and an authenticated redis:// or rediss:// REDIS_URL are required.',
    evaluate: (env) => {
      const backend = env('JOB_BACKEND')?.trim().toLowerCase();
      const redisUrl = env('REDIS_URL')?.trim();
      if (!backend || !redisUrl) return 'missing';
      if (backend !== 'bullmq') return 'unsafe';
      try {
        const parsed = new URL(redisUrl);
        return (parsed.protocol === 'redis:' || parsed.protocol === 'rediss:') &&
          Boolean(parsed.hostname) && Boolean(parsed.password)
          ? 'ready'
          : 'unsafe';
      } catch {
        return 'unsafe';
      }
    },
  },
  {
    id: 'sms_provider_value',
    area: 'identity',
    title: 'SMS provider is a value the code understands',
    requiredEnv: ['SMS_PROVIDER'],
    note: 'Допустимы production (с полным набором SMS_*), disabled (вход по SMS выключен) и noop вне production.',
    evaluate: (env) => {
      // Блюпринт задавал `silent` — значение, которого селектор не знает
      // (`otp-sender-selector.ts`). Вызов стоит в useFactory провайдера
      // OTP_SENDER, поэтому опечатка роняла контейнер Nest до первого запроса, и
      // снаружи это выглядело как 502 без объяснения. Преflight существует ровно
      // для того, чтобы такое имело внятное имя, а не превращалось в тишину.
      const mode = env('SMS_PROVIDER')?.trim().toLowerCase();
      if (!mode) return 'missing';
      if (mode === 'disabled') return 'ready';
      if (mode !== 'production') return 'unsafe';
      const complete = ['SMS_API_URL', 'SMS_API_KEY', 'SMS_SENDER_ID']
        .every((name) => Boolean(env(name)?.trim()));
      return complete ? 'ready' : 'unsafe';
    },
  },
];

export function buildProductionPreflightReport(
  env: EnvReader,
  now = new Date(),
): ProductionPreflightReport {
  const checks = CHECKS.map((definition) => evaluateCheck(definition, env));
  const blockingRemaining = checks.filter((check) => check.status !== 'ready').length;

  return {
    status: blockingRemaining === 0 ? 'ready' : 'blocked',
    generatedAt: now.toISOString(),
    summary: {
      ready: checks.filter((check) => check.status === 'ready').length,
      missing: checks.filter((check) => check.status === 'missing').length,
      unsafe: checks.filter((check) => check.status === 'unsafe').length,
      blockingRemaining,
    },
    checks,
    nextActions: checks
      .filter((check) => check.status !== 'ready')
      .map((check) => `${check.title}: ${check.note}`),
  };
}

export function assertProductionRuntimeReady(env: EnvReader): void {
  if (env('NODE_ENV') !== 'production') return;
  const report = buildProductionPreflightReport(env);
  if (report.status === 'ready') return;
  const failedIds = report.checks
    .filter((check) => check.status !== 'ready')
    .map((check) => check.id);
  throw new Error(`Production runtime preflight failed: ${failedIds.join(', ')}`);
}

function evaluateCheck(
  definition: CheckDefinition,
  env: EnvReader,
): ProductionPreflightCheck {
  const configuredEnv = definition.requiredEnv.filter((name) => hasEnv(env, name));
  const missingEnv = definition.requiredEnv.filter((name) => !hasEnv(env, name));
  const status =
    missingEnv.length > 0
      ? 'missing'
      : definition.evaluate?.(env) ?? 'ready';

  return {
    id: definition.id,
    area: definition.area,
    title: definition.title,
    status,
    blocking: true,
    requiredEnv: definition.requiredEnv,
    configuredEnv,
    missingEnv,
    note: definition.note,
  };
}

function boolReady(env: EnvReader, name: string): ProductionPreflightStatus {
  const value = env(name)?.trim().toLowerCase();
  if (!value) return 'missing';
  return value === 'true' ? 'ready' : 'unsafe';
}

function hasEnv(env: EnvReader, name: string): boolean {
  const value = env(name);
  return typeof value === 'string' && value.trim().length > 0;
}
