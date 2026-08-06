export type ReadinessStatus = 'missing' | 'configured' | 'certified' | 'blocked';

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
  attestationRequired: boolean;
  attestationEnv: string | null;
  manualChecks: string[];
  note: string;
}

export interface ExternalReadinessReport {
  contractVersion: 2;
  mode: 'demo' | 'production';
  status: 'ready' | 'blocked';
  generatedAt: string;
  summary: {
    certified: number;
    configured: number;
    missing: number;
    blocked: number;
    blockingRemaining: number;
  };
  checks: ExternalReadinessCheck[];
  nextActions: string[];
}

export type LegacyReadinessStatus = 'ready' | 'missing' | 'manual_required' | 'optional';

export interface LegacyExternalReadinessReport {
  status: 'ready' | 'blocked';
  generatedAt: string;
  summary: {
    ready: number;
    missing: number;
    manualRequired: number;
    optional: number;
    blockingRemaining: number;
  };
  checks: Array<Omit<ExternalReadinessCheck,
    'status' | 'attestationRequired' | 'attestationEnv'> & { status: LegacyReadinessStatus }>;
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
  attestationEnv?: string;
  blocking?: boolean;
  validate?: (env: EnvReader) => boolean;
  note: string;
}

const CHECKS: CheckDefinition[] = [
  {
    id: 'sms_provider',
    area: 'auth',
    title: 'Production SMS/OTP provider',
    // Две альтернативы: боевой оператор ИЛИ мост через Android-телефон
    // (`SMS_PROVIDER=android_gateway`). Настроенный мост снимает статус
    // `missing` — вход работает, — но certification marker держит его на
    // `configured`: абонентская SIM не сертифицированный A2P-канал, и
    // `SMS_PROVIDER_CERTIFIED=true` для неё не выставляется.
    requiredAny: [
      ['SMS_PROVIDER', 'SMS_API_URL', 'SMS_API_KEY', 'SMS_SENDER_ID'],
      ['SMS_PROVIDER', 'SMS_GATEWAY_URL', 'SMS_GATEWAY_USERNAME', 'SMS_GATEWAY_PASSWORD', 'SMS_GATEWAY_ENCRYPTION_PASSPHRASE'],
    ],
    attestationEnv: 'SMS_PROVIDER_CERTIFIED',
    manualChecks: [
      'Login and recovery OTP delivered to a real Kyrgyzstan phone number',
      'Sender ID approved and visible on the handset (n/a for the phone bridge — sender is a number)',
      'Provider outage returns an error without leaving a usable challenge',
      'Bridge only: SIM operator permits this A2P traffic and the volume stays within OTP-only limits',
    ],
    blocking: true,
    note: 'OTP sender port is ready. Certified activation needs a provider contract, sender ID, credentials and live delivery. The Android phone bridge (SMS_PROVIDER=android_gateway) delivers OTP end-to-end encrypted but is not a certified A2P channel.',
  },
  {
    id: 'payment_gateway',
    area: 'payments',
    title: 'Production payment gateway',
    requiredEnv: [
      'PAYMENT_PROVIDER',
      'PAYMENT_API_URL',
      'PAYMENT_MERCHANT_ID',
      'PAYMENT_API_KEY',
      'PAYMENT_WEBHOOK_SECRET',
    ],
    attestationEnv: 'PAYMENT_PROVIDER_CERTIFIED',
    manualChecks: [
      'Real intent creation and amount/order reconciliation verified',
      'Invalid webhook signature rejected using raw request bytes',
      'Duplicate provider event delivered twice and applied once',
      'Approved online refund reconciled with the provider account',
    ],
    blocking: true,
    note: 'Provider port and sandbox are ready; production activation requires a merchant contract, credentials, signed webhook specification, and live refund reconciliation.',
  },
  {
    id: 'fiscal_provider',
    area: 'fiscal',
    title: 'Fiscalization (OFD/KKM)',
    // Без этой проверки launch:check проходил зелёным при полном отсутствии
    // фискализации — то есть врал про законность торговли. Чеки сейчас
    // «информационные» (fiscal/fiscal-provider.ts INFORMATIONAL_FISCAL_PROVIDER).
    requiredEnv: ['FISCAL_PROVIDER', 'FISCAL_API_URL', 'FISCAL_API_KEY'],
    attestationEnv: 'FISCAL_PROVIDER_CERTIFIED',
    manualChecks: [
      'POS sale issues a fiscal receipt with a fiscal number and QR, reconciled with the tax cabinet',
      'Fiscal lines present on refund and exchange',
      'Z-report and the offline KKM queue verified',
    ],
    blocking: true,
    note: 'Retail sale in KG legally requires a fiscal receipt with tax lines, a fiscal number and Z-reports. Receipts are informational only until a certified OFD/KKM contract and FISCAL_PROVIDER* credentials are in place; FISCAL_PROVIDER_CERTIFIED=true is set only after live tax-cabinet reconciliation.',
  },
  {
    id: 'ai_provider',
    area: 'ai',
    title: 'Hosted AI provider',
    requiredAny: [['ANTHROPIC_API_KEY'], ['AI_PROVIDER_KEY'], ['OPENROUTER_API_KEY']],
    optionalEnv: ['AI_PROVIDER', 'ANTHROPIC_MODEL', 'AI_MODEL', 'AI_FAST_MODEL'],
    attestationEnv: 'AI_PROVIDER_CERTIFIED',
    manualChecks: [
      'Owner-approved reference prompts cover grading, pricing, moderation and tool boundaries',
      'Production-shaped calls redact secrets/PII and cannot execute money, stock or RBAC mutations',
      'Operator records the provider/model/config and evidence reference for this deployment',
    ],
    blocking: true,
    note: 'Credentials configure hosted AI only. AI_PROVIDER_CERTIFIED=true is an operator deployment attestation that the named checks and evidence record were reviewed; the code does not validate that evidence and the marker must be reset after provider/model/policy changes.',
  },
  {
    id: 'telegram_bot',
    area: 'channels',
    title: 'Telegram bot activation',
    requiredEnv: ['TELEGRAM_BOT_TOKEN'],
    optionalEnv: ['TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_WEBHOOK_URL'],
    attestationEnv: 'TELEGRAM_BOT_CERTIFIED',
    manualChecks: [
      'BotFather webhook uses HTTPS and the configured secret-token header',
      'Production message and Mini App entry route to the intended tenant/account',
      'Operator records the bot/webhook evidence reference for this deployment',
    ],
    blocking: true,
    note: 'Token/webhook values only configure the bot. TELEGRAM_BOT_CERTIFIED=true is a resettable operator deployment attestation; the code does not inspect the evidence record.',
  },
  {
    id: 'telegram_ai_agent',
    area: 'ai',
    title: 'Telegram AI support/admin agent',
    requiredEnv: [
      'TELEGRAM_AGENT_ENABLED',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_WEBHOOK_SECRET',
      'TELEGRAM_WEBHOOK_URL',
      'TELEGRAM_MINI_APP_URL',
      'OUTBOX_RELAY_ENABLED',
      'NOTIFICATION_TRANSPORT',
    ],
    attestationEnv: 'TELEGRAM_AGENT_CERTIFIED',
    optionalEnv: [
      'TELEGRAM_AGENT_MODEL',
      'TELEGRAM_AGENT_CUSTOMER_AI_ENABLED',
      'CUSTOMER_AI_DATA_CERTIFIED',
    ],
    manualChecks: [
      'BotFather webhook is configured with the secret-token header',
      'Admin/owner pairing requires a fresh TOTP and the one-time code cannot be replayed',
      'Customer message creates one idempotent support ticket and reveals no other customer data',
      'Read-only AI tools cannot execute money, stock, RBAC, settings or release mutations',
      'Staff disconnect immediately disables Telegram access',
    ],
    blocking: true,
    note: 'The agent is fail-closed and remains disabled until a newly issued bot token, HTTPS webhook and live security certification are complete.',
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
    attestationEnv: 'WHATSAPP_BUSINESS_CERTIFIED',
    manualChecks: [
      'Meta webhook verification and signed callback handling succeed on the production URL',
      'A production-shaped inbound and outbound message reconcile to the correct customer/order',
      'Operator records the channel evidence reference for this deployment',
    ],
    blocking: true,
    note: 'Credentials configure WhatsApp only. WHATSAPP_BUSINESS_CERTIFIED=true is a resettable operator deployment attestation; the code does not inspect the evidence record.',
  },
  {
    id: 'apple_social_login',
    area: 'identity',
    title: 'Apple social login',
    requiredEnv: ['APPLE_CLIENT_ID'],
    optionalEnv: [
      'APPLE_JWKS_URL',
      'APPLE_TEAM_ID',
      'APPLE_KEY_ID',
      'APPLE_PRIVATE_KEY',
      'APPLE_REDIRECT_URI',
    ],
    attestationEnv: 'APPLE_SOCIAL_LOGIN_CERTIFIED',
    manualChecks: [
      'Production web and native callbacks accept the intended Apple audience and reject a wrong audience',
      'First login and private-email relay link the correct customer without duplicate identity creation',
      'Operator records the callback/client evidence reference for this deployment',
    ],
    blocking: true,
    note: 'Client identifiers configure Sign in with Apple only. APPLE_SOCIAL_LOGIN_CERTIFIED=true is a resettable operator deployment attestation; the code does not inspect the evidence record.',
  },
  {
    id: 'google_social_login',
    area: 'identity',
    title: 'Google social login',
    requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_WEB_CLIENT_ID'],
    attestationEnv: 'GOOGLE_SOCIAL_LOGIN_CERTIFIED',
    manualChecks: [
      'Production web/native login accepts each intended client audience and rejects a wrong audience',
      'Configured JavaScript origins and redirects complete login without identity duplication',
      'Operator records the client/origin evidence reference for this deployment',
    ],
    blocking: true,
    validate: (env) => {
      const webClientId = env('GOOGLE_WEB_CLIENT_ID')?.trim();
      return Boolean(webClientId && (env('GOOGLE_CLIENT_ID') ?? '')
        .split(',')
        .map((value) => value.trim())
        .includes(webClientId));
    },
    note: 'Client IDs configure Google login only. GOOGLE_SOCIAL_LOGIN_CERTIFIED=true is a resettable operator deployment attestation; the code does not inspect the evidence record.',
  },
  {
    id: 'telegram_social_login',
    area: 'identity',
    title: 'Telegram social login',
    requiredEnv: ['TELEGRAM_BOT_TOKEN'],
    optionalEnv: ['TELEGRAM_AUTH_MAX_AGE_SECONDS', 'TELEGRAM_LOGIN_REDIRECT_URI'],
    attestationEnv: 'TELEGRAM_SOCIAL_LOGIN_CERTIFIED',
    manualChecks: [
      'Production Login Widget/Mini App callback accepts a current signed payload and rejects tampering/expiry',
      'Login links the intended customer without cross-account or duplicate identity creation',
      'Operator records the callback evidence reference for this deployment',
    ],
    blocking: true,
    note: 'Bot/callback configuration does not certify social login. TELEGRAM_SOCIAL_LOGIN_CERTIFIED=true is a resettable operator deployment attestation; the code does not inspect the evidence record.',
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
      ['NOTIFICATION_TRANSPORT', 'EXPO_PUBLIC_EAS_PROJECT_ID'],
      ['NOTIFICATION_TRANSPORT', 'FCM_SERVICE_ACCOUNT_JSON'],
      ['NOTIFICATION_TRANSPORT', 'FCM_SERVICE_ACCOUNT_KEY_PATH'],
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
    attestationEnv: 'CAMPAIGN_DELIVERY_CERTIFIED',
    manualChecks: [
      'A production-shaped campaign reaches the intended consented segment through the selected transport',
      'Provider rejection, retry/idempotency and unsubscribe/consent behavior are reconciled',
      'Operator records delivery and reconciliation evidence for this deployment',
    ],
    blocking: true,
    note: 'Transport credentials only configure delivery. CAMPAIGN_DELIVERY_CERTIFIED=true is a resettable operator deployment attestation; the code does not inspect the evidence record.',
  },
  {
    id: 'native_push_android',
    area: 'mobile',
    title: 'Android FCM push credentials',
    requiredAny: [['FCM_SERVICE_ACCOUNT_JSON'], ['FCM_SERVICE_ACCOUNT_KEY_PATH']],
    attestationEnv: 'FCM_PROVIDER_CERTIFIED',
    optionalEnv: [
      'EXPO_PUBLIC_EAS_PROJECT_ID',
      'EXPO_TOKEN',
    ],
    manualChecks: [
      'Staff token registered under an active staff JWT on a physical Android device',
      'Foreground and background task notifications open the native Tasks screen',
      'Revoked tokens are disabled after a provider rejection',
    ],
    blocking: true,
    note: 'Native Staff FCM registration, delivery and routing are implemented; production service account and physical-device delivery must be certified before release.',
  },
  {
    id: 'native_push_ios',
    area: 'mobile',
    title: 'iOS APNs delivery',
    requiredEnv: ['APNS_KEY_ID', 'APNS_TEAM_ID'],
    attestationEnv: 'APNS_CERTIFIED',
    manualChecks: [
      'APNs provider authentication succeeds without logging key material',
      'A physical iPhone registers a native token for the signed-in customer or staff identity',
      'Foreground/background delivery opens the intended owner-scoped native route',
      'Evidence reference identifies the tested build, device class, environment and time',
    ],
    blocking: true,
    note: 'APNs key metadata only proves configuration. APNS_CERTIFIED=true requires physical-device delivery and routing evidence for the release build.',
  },
  {
    id: 'outbox_health',
    area: 'jobs',
    title: 'Outbox health and DLQ age',
    requiredEnv: ['OUTBOX_RELAY_ENABLED', 'NOTIFICATION_TRANSPORT'],
    optionalEnv: ['OUTBOX_MAX_PENDING_AGE_SECONDS', 'OUTBOX_MAX_DLQ_AGE_SECONDS'],
    attestationEnv: 'OUTBOX_HEALTH_CERTIFIED',
    validate: (env) => {
      const relay = env('OUTBOX_RELAY_ENABLED')?.trim().toLowerCase();
      const transport = env('NOTIFICATION_TRANSPORT')?.trim().toLowerCase();
      return relay === 'true' && Boolean(transport && transport !== 'log');
    },
    manualChecks: [
      'GET /api/observability/status records pending depth and oldest pending age below the agreed threshold',
      'The same evidence records DLQ/failed depth and oldest failed age; the current endpoint must be extended if oldest failed age is absent',
      'A production-shaped message is delivered once and relay heartbeat remains current',
      'Evidence reference identifies the environment, release SHA, observation window and redrive result',
    ],
    blocking: true,
    note: 'Relay/transport settings are configuration only. OUTBOX_HEALTH_CERTIFIED=true is allowed only after time-bound status evidence covers pending and failed/DLQ age; it is not a substitute for current monitoring.',
  },
  {
    id: 'meilisearch',
    area: 'search',
    title: 'Meilisearch acceleration',
    requiredEnv: ['MEILI_HOST', 'MEILI_API_KEY'],
    optionalEnv: ['MEILI_PRODUCTS_INDEX'],
    attestationEnv: 'MEILISEARCH_CERTIFIED',
    manualChecks: [
      'Products index rebuild completes from PostgreSQL source of truth',
      'Typo/facet query returns expected products and source=meilisearch',
      'Meilisearch outage falls back to PostgreSQL without losing catalog availability',
      'Backup/restore runbook explicitly rebuilds the disposable search index',
    ],
    blocking: true,
    note: 'Host and API key only configure the accelerator. Certification requires an indexed-query, fallback and rebuild evidence record; PostgreSQL remains authoritative.',
  },
  {
    id: 'native_links',
    area: 'mobile',
    title: 'Native HTTPS links',
    requiredEnv: ['APPLE_TEAM_ID', 'ANDROID_APP_LINK_SHA256'],
    attestationEnv: 'NATIVE_LINKS_CERTIFIED',
    manualChecks: [
      'Production AASA and assetlinks endpoints return exact signed application identifiers',
      'Physical iOS and Android release builds open payment/order links in the correct app',
      'Wrong hosts and unsigned/non-release builds remain rejected',
    ],
    blocking: true,
    note: 'Signing identifiers configure association documents. NATIVE_LINKS_CERTIFIED=true requires deployed-domain and physical release-build evidence.',
  },
  {
    id: 'backup_restore',
    area: 'recovery',
    title: 'Production backup and restore certification',
    requiredEnv: ['S3_BACKUP_BUCKET'],
    attestationEnv: 'BACKUP_RESTORE_CERTIFIED',
    manualChecks: [
      'A fresh backup from the production-shaped bucket restores into an isolated database',
      'Schema, migrations, triggers, accounting integrity and required table counts reconcile',
      'Evidence objects are restored or their independent recovery procedure is verified',
      'Evidence reference identifies source object, release SHA, timestamps and verifier output',
    ],
    blocking: true,
    note: 'A bucket name or successful local MinIO drill is configuration/software evidence only. BACKUP_RESTORE_CERTIFIED=true requires a recorded production-shaped restore.',
  },
  {
    id: 'partner_payout_provider',
    area: 'payments',
    title: 'Partner payout provider',
    requiredEnv: ['PARTNER_PAYOUT_PROVIDER'],
    attestationEnv: 'PARTNER_PAYOUT_PROVIDER_CERTIFIED',
    manualChecks: [
      'Provider payout is idempotent under retry and stores a unique external reference',
      'Duplicate and rejected payouts do not double-settle a partner liability',
      'Provider statement reconciles gross amount, commission and owner/partner amount',
      'Cash/manual fallback remains explicitly classified and audited',
    ],
    blocking: true,
    note: 'The existing consignment payout ledger supports recorded channels, but a provider name alone is not a live integration. Certification requires provider retry and statement reconciliation evidence.',
  },
  {
    id: 'pos_hardware',
    area: 'hardware',
    title: 'Physical POS certification',
    attestationEnv: 'POS_HARDWARE_CERTIFIED',
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
    attestationEnv: 'S3_MEDIA_STORAGE_CERTIFIED',
    manualChecks: [
      'Upload/download/delete succeeds against the production bucket with least-privilege credentials',
      'Public/signed URL, retention and unavailable-provider behavior match the production policy',
      'Operator records bucket-policy and smoke evidence for this deployment',
    ],
    blocking: true,
    note: 'Bucket credentials only configure storage. S3_MEDIA_STORAGE_CERTIFIED=true is a resettable operator deployment attestation; the code does not inspect the evidence record.',
  },
  {
    id: 'observability',
    area: 'production',
    title: 'Sentry/GlitchTip error reporting',
    requiredEnv: ['SENTRY_DSN'],
    attestationEnv: 'OBSERVABILITY_CERTIFIED',
    manualChecks: [
      'A controlled server and Web error arrive in the intended production project without secrets/PII',
      'Alert routing reaches the on-call owner and links back to the release/environment',
      'Operator records alert and redaction evidence for this deployment',
    ],
    blocking: true,
    note: 'A DSN only configures reporting. OBSERVABILITY_CERTIFIED=true is a resettable operator deployment attestation; the code does not inspect the evidence record.',
  },
];

/** Canonical env contract consumed by production-template coverage. */
export function externalReadinessEnvNames(): string[] {
  return [...new Set(CHECKS.flatMap((definition) => [
    ...requiredEnvNames(definition),
    ...(definition.attestationEnv ? [definition.attestationEnv] : []),
  ]))];
}

export function buildExternalReadinessReport(
  env: EnvReader,
  now = new Date(),
): ExternalReadinessReport {
  const demoMode = env('PUBLIC_DEMO_MODE')?.trim().toLowerCase() === 'true';
  const checks = CHECKS.map((definition) => evaluateCheck(definition, env, demoMode));
  const blockingRemaining = checks.filter((check) => check.blocking && !isSatisfied(check)).length;
  return {
    contractVersion: 2,
    mode: demoMode ? 'demo' : 'production',
    status: blockingRemaining === 0 ? 'ready' : 'blocked',
    generatedAt: now.toISOString(),
    summary: {
      certified: checks.filter((check) => check.status === 'certified').length,
      configured: checks.filter((check) => check.status === 'configured').length,
      missing: checks.filter((check) => check.status === 'missing').length,
      blocked: checks.filter((check) => check.status === 'blocked').length,
      blockingRemaining,
    },
    checks,
    nextActions: checks
      .filter((check) => check.blocking && !isSatisfied(check))
      .map((check) => `${check.title}: ${check.note}`),
  };
}

/**
 * Stable v1 projection for rolling deploys. The legacy route intentionally keeps
 * the old vocabulary until every old Web image has drained.
 */
export function projectLegacyExternalReadinessReport(
  report: ExternalReadinessReport,
): LegacyExternalReadinessReport {
  const checks = report.checks.map((check) => {
    const { attestationRequired, attestationEnv, ...legacyCheck } = check;
    return {
      ...legacyCheck,
      status: legacyStatus(check),
    };
  });

  return {
    status: report.mode === 'demo' ? 'blocked' : report.status,
    generatedAt: report.generatedAt,
    summary: {
      ready: checks.filter((check) => check.status === 'ready').length,
      missing: checks.filter((check) => check.status === 'missing').length,
      manualRequired: checks.filter((check) => check.status === 'manual_required').length,
      optional: checks.filter((check) => check.status === 'optional').length,
      blockingRemaining: report.mode === 'demo'
        ? Math.max(1, report.summary.blockingRemaining)
        : report.summary.blockingRemaining,
    },
    checks,
    nextActions: report.mode === 'demo'
      ? ['Public demo mode cannot assert production readiness.', ...report.nextActions]
      : report.nextActions,
  };
}

function legacyStatus(check: ExternalReadinessCheck): LegacyReadinessStatus {
  if (check.status === 'certified') return 'ready';
  if (check.status === 'configured') {
    return check.attestationRequired ? 'manual_required' : 'ready';
  }
  if (check.status === 'blocked') {
    return check.attestationRequired ? 'manual_required' : 'missing';
  }
  return check.blocking ? 'missing' : 'optional';
}

function evaluateCheck(definition: CheckDefinition, env: EnvReader, demoMode: boolean): ExternalReadinessCheck {
  const blocking = demoMode
    ? definition.id === 's3_media_storage' || definition.id === 'observability'
    : definition.blocking ?? false;
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

  const missingConfiguration = definition.requiredAny
    ? !anySatisfied
    : (definition.requiredEnv ?? []).some((name) => !hasEnv(env, name));
  let status: ReadinessStatus;
  if (missingConfiguration) {
    status = 'missing';
  } else if (definition.validate?.(env) === false) {
    status = 'blocked';
  } else if (definition.attestationEnv) {
    status = isTrue(env, definition.attestationEnv)
      ? 'certified'
      : requiredEnv.length === 0
        ? 'blocked'
        : 'configured';
  } else {
    status = 'configured';
  }

  return {
    id: definition.id,
    area: definition.area,
    title: definition.title,
    status,
    blocking,
    requiredEnv,
    optionalEnv,
    configuredEnv,
    missingEnv,
    attestationRequired: Boolean(definition.attestationEnv),
    attestationEnv: definition.attestationEnv ?? null,
    manualChecks: definition.manualChecks ?? [],
    note: definition.note,
  };
}

function requiredEnvNames(definition: CheckDefinition): string[] {
  const required = definition.requiredEnv ?? [];
  const any = definition.requiredAny?.flat() ?? [];
  return [...new Set([...required, ...any])];
}

function isSatisfied(check: ExternalReadinessCheck): boolean {
  return check.status === 'certified'
    || (!check.attestationRequired && check.status === 'configured');
}

function isTrue(env: EnvReader, name: string): boolean {
  return env(name)?.trim().toLowerCase() === 'true';
}

function hasEnv(env: EnvReader, name: string): boolean {
  const value = env(name);
  return typeof value === 'string' && value.trim().length > 0;
}
