"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BACKUP_MAX_AGE_HOURS = exports.BACKUP_LAST_FAILURE_KEY = exports.BACKUP_LAST_SUCCESS_KEY = void 0;
exports.evaluateBackupFreshness = evaluateBackupFreshness;
exports.parseBackupFailureAt = parseBackupFailureAt;
exports.parseBackupMarker = parseBackupMarker;
exports.BACKUP_LAST_SUCCESS_KEY = 'ops.backup.last_success';
exports.BACKUP_LAST_FAILURE_KEY = 'ops.backup.last_failure';
exports.DEFAULT_BACKUP_MAX_AGE_HOURS = 26;
const HOUR_MS = 60 * 60 * 1000;
function evaluateBackupFreshness(lastSuccessAt, now = new Date(), maxAgeHours = exports.DEFAULT_BACKUP_MAX_AGE_HOURS) {
    if (!lastSuccessAt)
        return { status: 'never', ageHours: null, lastSuccessAt: null };
    const ageHours = (now.getTime() - lastSuccessAt.getTime()) / HOUR_MS;
    return {
        status: ageHours > maxAgeHours ? 'stale' : 'ok',
        ageHours: Math.round(ageHours * 100) / 100,
        lastSuccessAt: lastSuccessAt.toISOString(),
    };
}
function parseBackupFailureAt(raw) {
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        return typeof parsed.failedAt === 'string' ? parsed.failedAt : null;
    }
    catch {
        return null;
    }
}
function parseBackupMarker(raw) {
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.completedAt !== 'string')
            return null;
        const completedAt = new Date(parsed.completedAt);
        if (Number.isNaN(completedAt.getTime()))
            return null;
        return { completedAt, key: typeof parsed.key === 'string' ? parsed.key : '' };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=backup-status.js.map