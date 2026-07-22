import { ConfigService } from '@nestjs/config';
import { EvidenceEntityType } from './evidence.dto';

export interface EvidenceRetentionDecision {
  isPii: boolean;
  retentionUntil: Date | null;
  policyVersion: string;
}

// Метки фото устройства при скупке — не PII: они нужны анти-фроду и гарантии,
// удалять их по сроку нельзя. Всё остальное под `tradein` считается PII.
const TRADEIN_DEVICE_LABELS = new Set([
  'tradein_device',
  'device_front',
  'device_back',
  'imei',
  'imei_photo',
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
 * Trade-in evidence is treated as PII **fail-closed**: any photo taken during a
 * buyback is auto-purged unless it is explicitly a device photo. A used-device
 * purchase legally requires the seller's passport, and the client historically
 * sent every buyback photo under one free-text label (`buyback_evidence`) that
 * was not on the PII list — so passports were never deleted. Classifying by an
 * allowlist of *safe* labels instead of *sensitive* ones means a mislabelled or
 * novel-labelled passport from any client still gets purged; over-purging a
 * device photo is recoverable, keeping a passport forever is not.
 *
 * Warranty, service, order and inventory evidence stays retained until a
 * separate business/legal policy is approved.
 */
export function decideEvidenceRetention(
  config: ConfigService | undefined,
  entityType: EvidenceEntityType | string,
  label: string | null | undefined,
  createdAt = new Date(),
): EvidenceRetentionDecision {
  const normalized = label?.trim().toLowerCase() ?? '';
  const isPii = entityType === 'tradein' && !TRADEIN_DEVICE_LABELS.has(normalized);
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
