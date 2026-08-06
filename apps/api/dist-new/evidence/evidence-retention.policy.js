"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideEvidenceRetention = decideEvidenceRetention;
const TRADEIN_DEVICE_LABELS = new Set([
    'tradein_device',
    'device_front',
    'device_back',
    'imei',
    'imei_photo',
]);
function getConfig(config, key, fallback) {
    return config?.get(key, fallback) ?? process.env[key] ?? fallback;
}
function retentionDays(config) {
    const value = Number(getConfig(config, 'EVIDENCE_PII_RETENTION_DAYS', '365'));
    if (!Number.isInteger(value) || value < 30 || value > 3650) {
        throw new Error('EVIDENCE_PII_RETENTION_DAYS must be an integer between 30 and 3650');
    }
    return value;
}
function decideEvidenceRetention(config, entityType, label, createdAt = new Date()) {
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
//# sourceMappingURL=evidence-retention.policy.js.map