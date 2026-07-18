import { ConfigService } from '@nestjs/config';
import { EvidenceEntityType } from './evidence.dto';

export interface EvidenceRetentionDecision {
  isPii: boolean;
  retentionUntil: Date | null;
  policyVersion: string;
}

const PII_LABELS = new Set([
  'passport',
  'passport_front',
  'passport_back',
  'identity_document',
  'tradein_kyc',
]);

function getConfig(config: ConfigService | undefined, key: string, fallback: string): string {
  return config?.get<string>(key, fallback) ?? process.env[key] ?? fallback;
}

function retentionDays(config?: ConfigService): number {
  const value = Number(getConfig(config, 'EVIDENCE_PII_RETENTION_DAYS', '365'));
  if (!Number.isInteger(value) || value < 30 || value > 3650) {
    throw new Error('EVIDENCE_PII_RETENTION_DAYS must be an integer between 30 and 3650');
  }
  return value;
}

/**
 * Only explicitly classified trade-in identity documents are auto-purged.
 * General warranty, service, order and inventory evidence remains retained
 * until a separate business/legal policy is approved.
 */
export function decideEvidenceRetention(
  config: ConfigService | undefined,
  entityType: EvidenceEntityType | string,
  label: string | null | undefined,
  createdAt = new Date(),
): EvidenceRetentionDecision {
  const normalized = label?.trim().toLowerCase() ?? '';
  const isPii = entityType === 'tradein' && PII_LABELS.has(normalized);
  if (!isPii) {
    return {
      isPii: false,
      retentionUntil: null,
      policyVersion: getConfig(config, 'EVIDENCE_RETENTION_POLICY_VERSION', 'kg-privacy-v1'),
    };
  }
  const until = new Date(createdAt.getTime());
  until.setUTCDate(until.getUTCDate() + retentionDays(config));
  return {
    isPii: true,
    retentionUntil: until,
    policyVersion: getConfig(config, 'EVIDENCE_RETENTION_POLICY_VERSION', 'kg-privacy-v1'),
  };
}
