export declare const MAX_REFUND_ATTEMPTS = 5;
export declare const PROVIDER_TERMINAL_FAILURE_PREFIX = "provider_terminal_failure:";
export declare const PROVIDER_PENDING_STALE_PREFIX = "provider_pending_stale:";
export declare const DEFAULT_PROVIDER_PENDING_STALE_MS: number;
export declare function isStaleProviderPendingFailure(lastError: string | null): boolean;
export declare function nextRefundAttempt(attempts: number, now?: number): Date;
