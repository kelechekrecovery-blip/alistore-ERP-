export const MAX_REFUND_ATTEMPTS = 5;

/**
 * lastError prefixes with operator semantics:
 * - `provider_terminal_failure:` — verified terminal failure from a provider
 *   webhook; never auto-retried, cancellable via the strict path.
 * - `provider_pending_stale:` — the provider accepted the refund but the
 *   callback never arrived within the stale threshold; the sweep parks the
 *   allocation here. Never auto-retried (re-calling the provider is ambiguous),
 *   resolvable by a late webhook or an operator resolve.
 */
export const PROVIDER_TERMINAL_FAILURE_PREFIX = 'provider_terminal_failure:';
export const PROVIDER_PENDING_STALE_PREFIX = 'provider_pending_stale:';

/** Default age after which a `provider_pending` allocation is considered stale. */
export const DEFAULT_PROVIDER_PENDING_STALE_MS = 24 * 60 * 60_000;

export function isStaleProviderPendingFailure(lastError: string | null) {
  return Boolean(lastError?.startsWith(PROVIDER_PENDING_STALE_PREFIX));
}

export function nextRefundAttempt(attempts: number, now = Date.now()) {
  const delayMs = Math.min(60_000 * 2 ** Math.max(attempts - 1, 0), 60 * 60_000);
  return new Date(now + delayMs);
}
