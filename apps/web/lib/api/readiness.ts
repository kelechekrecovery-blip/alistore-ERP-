import { API_BASE } from './http';

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
  /** Client-only signal while temporarily consuming the legacy endpoint. */
  sourceContractVersion?: 1;
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

/** Staff-only: the report lists which integrations are still unconfigured. */
export async function fetchExternalReadiness(accessToken: string): Promise<ExternalReadinessReport> {
  const init = {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  } as const;
  const v2 = await fetch(`${API_BASE}/health/integrations/v2`, init);
  if (v2.ok) return parseExternalReadinessV2(await readJson(v2));
  if (v2.status !== 404) throw new Error(`readiness -> ${v2.status}`);

  const legacy = await fetch(`${API_BASE}/health/integrations`, init);
  if (!legacy.ok) throw new Error(`readiness legacy -> ${legacy.status}`);
  return normalizeLegacyReadiness(await readJson(legacy));
}

export function parseExternalReadinessV2(value: unknown): ExternalReadinessReport {
  if (!isRecord(value)
    || value.contractVersion !== 2
    || (value.mode !== 'demo' && value.mode !== 'production')
    || (value.status !== 'ready' && value.status !== 'blocked')
    || typeof value.generatedAt !== 'string'
    || !isV2Summary(value.summary)
    || !Array.isArray(value.checks)
    || !value.checks.every(isV2Check)
    || !isStringArray(value.nextActions)) {
    throw invalidResponse();
  }
  const report = value as unknown as ExternalReadinessReport;
  const aggregate = deriveV2Aggregate(report.checks);
  if (!hasConsistentV2Report(report, aggregate)) throw invalidResponse();
  return { ...report, ...aggregate };
}

function normalizeLegacyReadiness(value: unknown): ExternalReadinessReport {
  if (!isRecord(value)
    || (value.status !== 'ready' && value.status !== 'blocked')
    || typeof value.generatedAt !== 'string'
    || !Array.isArray(value.checks)
    || !value.checks.every(isLegacyCheck)
    || !isStringArray(value.nextActions)) {
    throw invalidResponse();
  }

  const checks: ExternalReadinessCheck[] = value.checks.map((raw) => {
    const check = raw as Record<string, unknown>;
    const legacyStatus = check.status as 'ready' | 'missing' | 'manual_required' | 'optional';
    return {
      id: check.id as string,
      area: check.area as string,
      title: check.title as string,
      status: legacyStatus === 'ready' || legacyStatus === 'manual_required'
        ? 'configured'
        : 'missing',
      blocking: check.blocking as boolean,
      requiredEnv: check.requiredEnv as string[],
      optionalEnv: check.optionalEnv as string[],
      configuredEnv: check.configuredEnv as string[],
      missingEnv: check.missingEnv as string[],
      attestationRequired: true,
      attestationEnv: null,
      manualChecks: check.manualChecks as string[],
      note: check.note as string,
    };
  });

  return {
    contractVersion: 2,
    sourceContractVersion: 1,
    mode: 'production',
    status: 'blocked',
    generatedAt: value.generatedAt,
    summary: {
      certified: 0,
      configured: checks.filter((check) => check.status === 'configured').length,
      missing: checks.filter((check) => check.status === 'missing').length,
      blocked: 0,
      blockingRemaining: checks.filter((check) => check.blocking).length,
    },
    checks,
    nextActions: [
      'API readiness v2 must be deployed before production readiness can be asserted.',
      ...(value.nextActions as string[]),
    ],
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw invalidResponse();
  }
}

function isV2Summary(value: unknown): boolean {
  return isRecord(value)
    && isNonNegativeNumber(value.certified)
    && isNonNegativeNumber(value.configured)
    && isNonNegativeNumber(value.missing)
    && isNonNegativeNumber(value.blocked)
    && isNonNegativeNumber(value.blockingRemaining);
}

function isV2Check(value: unknown): boolean {
  return isBaseCheck(value)
    && ['missing', 'configured', 'certified', 'blocked'].includes(value.status as string)
    && typeof value.attestationRequired === 'boolean'
    && (value.attestationEnv === null || typeof value.attestationEnv === 'string')
    && value.attestationRequired === (typeof value.attestationEnv === 'string')
    && (value.attestationEnv === null || ENV_NAME_PATTERN.test(value.attestationEnv))
    && (value.status !== 'certified' || value.attestationRequired === true)
    && hasCoherentConfigurationSets(value);
}

const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function hasCoherentConfigurationSets(check: Record<string, unknown>): boolean {
  const required = check.requiredEnv as string[];
  const optional = check.optionalEnv as string[];
  const configured = check.configuredEnv as string[];
  const missing = check.missingEnv as string[];
  const status = check.status as ReadinessStatus;
  const allowedConfigured = new Set([...required, ...optional]);
  const requiredSet = new Set(required);
  const missingSet = new Set(missing);

  if (![required, optional, configured, missing].every(hasUniqueValues)) return false;
  if (![...required, ...optional].every((name) => ENV_NAME_PATTERN.test(name))) return false;
  if (optional.some((name) => requiredSet.has(name))) return false;
  if (!configured.every((name) => allowedConfigured.has(name))) return false;
  if (!missing.every((name) => requiredSet.has(name))) return false;
  if (configured.some((name) => missingSet.has(name))) return false;
  if (status === 'missing') return missing.length > 0;
  return missing.length === 0;
}

function hasUniqueValues(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function deriveV2Aggregate(checks: ExternalReadinessCheck[]): Pick<
  ExternalReadinessReport,
  'status' | 'summary'
> {
  const certified = checks.filter((check) => check.status === 'certified').length;
  const configured = checks.filter((check) => check.status === 'configured').length;
  const missing = checks.filter((check) => check.status === 'missing').length;
  const blocked = checks.filter((check) => check.status === 'blocked').length;
  const blockingRemaining = checks.filter((check) => check.blocking
    && check.status !== 'certified'
    && !(check.status === 'configured' && !check.attestationRequired)).length;
  return {
    status: blockingRemaining === 0 ? 'ready' : 'blocked',
    summary: { certified, configured, missing, blocked, blockingRemaining },
  };
}

function hasConsistentV2Report(
  report: ExternalReadinessReport,
  aggregate: Pick<ExternalReadinessReport, 'status' | 'summary'>,
): boolean {
  return report.status === aggregate.status
    && report.summary.certified === aggregate.summary.certified
    && report.summary.configured === aggregate.summary.configured
    && report.summary.missing === aggregate.summary.missing
    && report.summary.blocked === aggregate.summary.blocked
    && report.summary.blockingRemaining === aggregate.summary.blockingRemaining;
}

function isLegacyCheck(value: unknown): boolean {
  return isBaseCheck(value)
    && ['ready', 'missing', 'manual_required', 'optional'].includes(value.status as string);
}

function isBaseCheck(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.area === 'string'
    && typeof value.title === 'string'
    && typeof value.blocking === 'boolean'
    && isStringArray(value.requiredEnv)
    && isStringArray(value.optionalEnv)
    && isStringArray(value.configuredEnv)
    && isStringArray(value.missingEnv)
    && isStringArray(value.manualChecks)
    && typeof value.note === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function invalidResponse(): Error {
  return new Error('invalid readiness response');
}
