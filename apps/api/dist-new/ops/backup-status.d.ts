export declare const BACKUP_LAST_SUCCESS_KEY = "ops.backup.last_success";
export declare const BACKUP_LAST_FAILURE_KEY = "ops.backup.last_failure";
export declare const DEFAULT_BACKUP_MAX_AGE_HOURS = 26;
export type BackupFreshnessStatus = 'ok' | 'stale' | 'never';
export interface BackupFreshness {
    status: BackupFreshnessStatus;
    ageHours: number | null;
    lastSuccessAt: string | null;
}
export interface BackupMarker {
    completedAt: Date;
    key: string;
}
export declare function evaluateBackupFreshness(lastSuccessAt: Date | null, now?: Date, maxAgeHours?: number): BackupFreshness;
export declare function parseBackupFailureAt(raw: string | null | undefined): string | null;
export declare function parseBackupMarker(raw: string | null | undefined): BackupMarker | null;
