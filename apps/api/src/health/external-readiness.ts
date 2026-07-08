export type ReadinessStatus = 'ready' | 'missing' | 'manual_required' | 'optional';

export interface ExternalReadinessCheck {
  id: string;
  area: string;
  title: string;
  status: ReadinessStatus;
  blocking: boolean;
  requiredEnv: string[];
  optionalEnv: string[];
  configuredEnv: string[];
  missingEnv: string[];
  manualChecks: string[];
  note: string;
}

export interface ExternalReadinessReport {
  status: 'ready' | 'blocked';
  generatedAt: string;
  summary: {
    ready: number;
    missing: number;
    manualRequired: number;
    optional: number;
    blockingRemaining: number;
  };
  checks: ExternalReadinessCheck[];
  nextActions: string[];
}

type EnvReader = (name: string) => string | undefined;

interface CheckDefinition {
  id: string;
  area: string;
  title: string;
  requiredEnv?: string[];
  requiredAny?: string[][];
  optionalEnv?: string[];
  manualChecks?: string[];
  completionMarkerEnv?: string;
  blocking?: boolean;
  note: string;
}

const CHECKS: CheckDefinition[] = [
  {
    id: 'ai_provider',
    area: 'ai',
    title: 'Hosted AI provider',
    requiredAny: [['AI_PROVIDER_KEY'], ['OPENROUTER_API_KEY']],
    optionalEnv: ['AI_MODEL'],
    blocking: true,
    note: 'Unlocks LLM/vision/market-scout paths; keyless rule engines remain available.',
  },
  {
    id: 'telegram_bot',
    area: 'channels',
    title: 'Telegram bot activation',
    requiredEnv: ['TELEGRAM_BOT_TOKEN'],
    optionalEnv: ['TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_WEBHOOK_URL'],
    blocking: true,
    note: '/tg Mini App shell is live; bot token/webhook activate production launch.',
  },
  {
    id: 'whatsapp_business',
    area: 'channels',
    title: 'WhatsApp Business channel',
    requiredEnv: [
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    ],
    blocking: true,
    note: 'Required before WhatsApp storefront/order notifications can be enabled.',
  },
  {
    id: 'apple_social_login',
    area: 'identity',
    title: 'Apple social login',
    requiredEnv: [
      'APPLE_CLIENT_ID',
      'APPLE_TEAM_ID',
      'APPLE_KEY_ID',
      'APPLE_PRIVATE_KEY',
    ],
    optionalEnv: ['APPLE_REDIRECT_URI'],
    blocking: true,
    note: 'Required before enabling real Apple login providers.',
  },
  {
    id: 'telegram_social_login',
    area: 'identity',
    title: 'Telegram social login',
    requiredEnv: ['TELEGRAM_BOT_TOKEN'],
    optionalEnv: ['TELEGRAM_LOGIN_REDIRECT_URI'],
    blocking: true,
    note: 'Shares the Telegram bot token; callback URL must be configured at launch.',
  },
  {
    id: 'campaign_delivery',
    area: 'growth',
    title: 'Campaign delivery transport',
    requiredAny: [
      ['NOTIFICATION_TRANSPORT', 'NOVU_API_KEY'],
      ['NOTIFICATION_TRANSPORT', 'SMTP_HOST'],
      ['NOTIFICATION_TRANSPORT', 'TELEGRAM_BOT_TOKEN'],
      [
        'NOTIFICATION_TRANSPORT',
        'WHATSAPP_ACCESS_TOKEN',
        'WHATSAPP_PHONE_NUMBER_ID',
      ],
    ],
    optionalEnv: [
      'NOVU_API_URL',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_FROM',
      'SMTP_SECURE',
      'TELEGRAM_API_URL',
      'WHATSAPP_API_URL',
      'WHATSAPP_API_VERSION',
    ],
    blocking: true,
    note: 'Segment Builder and ROI are ready; set NOTIFICATION_TRANSPORT=channels/providers or a single transport with Novu, SMTP, Telegram, or WhatsApp credentials.',
  },
  {
    id: 'pos_hardware',
    area: 'hardware',
    title: 'Physical POS certification',
    completionMarkerEnv: 'POS_HARDWARE_CERTIFIED',
    manualChecks: [
      'Silent ESC/POS or QZ Tray receipt print verified on store printer',
      'Bank terminal SDK/payment handoff verified with provider account',
      'Real scanner QA completed for SKU/barcode and IMEI input',
    ],
    blocking: true,
    note: 'Software fallbacks are ready; this requires devices/provider accounts on site.',
  },
  {
    id: 's3_media_storage',
    area: 'production',
    title: 'S3/MinIO media storage',
    requiredEnv: ['S3_ENDPOINT', 'MINIO_BUCKET', 'MINIO_ROOT_USER', 'MINIO_ROOT_PASSWORD'],
    optionalEnv: ['S3_REGION', 'S3_PUBLIC_BASE'],
    blocking: false,
    note: 'Local disk storage works in dev; configure S3-compatible storage for production evidence.',
  },
  {
    id: 'observability',
    area: 'production',
    title: 'Sentry/GlitchTip error reporting',
    requiredEnv: ['SENTRY_DSN'],
    blocking: false,
    note: 'Optional for dev, recommended before production launch.',
  },
];

export function buildExternalReadinessReport(
  env: EnvReader,
  now = new Date(),
): ExternalReadinessReport {
  const checks = CHECKS.map((definition) => evaluateCheck(definition, env));
  const blockingRemaining = checks.filter(
    (check) => check.blocking && check.status !== 'ready',
  ).length;
  return {
    status: blockingRemaining === 0 ? 'ready' : 'blocked',
    generatedAt: now.toISOString(),
    summary: {
      ready: checks.filter((check) => check.status === 'ready').length,
      missing: checks.filter((check) => check.status === 'missing').length,
      manualRequired: checks.filter((check) => check.status === 'manual_required').length,
      optional: checks.filter((check) => check.status === 'optional').length,
      blockingRemaining,
    },
    checks,
    nextActions: checks
      .filter((check) => check.blocking && check.status !== 'ready')
      .map((check) => `${check.title}: ${check.note}`),
  };
}

function evaluateCheck(definition: CheckDefinition, env: EnvReader): ExternalReadinessCheck {
  const requiredEnv = requiredEnvNames(definition);
  const optionalEnv = definition.optionalEnv ?? [];
  const configuredEnv = [...requiredEnv, ...optionalEnv].filter((name) => hasEnv(env, name));
  const anySatisfied = definition.requiredAny?.some((group) =>
    group.every((name) => hasEnv(env, name)),
  );
  const missingEnv =
    definition.requiredAny && anySatisfied
      ? []
      : requiredEnv.filter((name) => !hasEnv(env, name));

  let status: ReadinessStatus;
  if (definition.completionMarkerEnv) {
    status = env(definition.completionMarkerEnv) === 'true' ? 'ready' : 'manual_required';
  } else if (definition.requiredAny) {
    status = anySatisfied
      ? 'ready'
      : definition.blocking === false
        ? 'optional'
        : 'missing';
  } else if (missingEnv.length === 0) {
    status = 'ready';
  } else {
    status = definition.blocking === false ? 'optional' : 'missing';
  }

  return {
    id: definition.id,
    area: definition.area,
    title: definition.title,
    status,
    blocking: definition.blocking ?? false,
    requiredEnv,
    optionalEnv,
    configuredEnv,
    missingEnv,
    manualChecks: definition.manualChecks ?? [],
    note: definition.note,
  };
}

function requiredEnvNames(definition: CheckDefinition): string[] {
  const required = definition.requiredEnv ?? [];
  const any = definition.requiredAny?.flat() ?? [];
  const marker = definition.completionMarkerEnv ? [definition.completionMarkerEnv] : [];
  return [...new Set([...required, ...any, ...marker])];
}

function hasEnv(env: EnvReader, name: string): boolean {
  const value = env(name);
  return typeof value === 'string' && value.trim().length > 0;
}
