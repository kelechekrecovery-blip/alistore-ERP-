export const MAX_REFUND_ATTEMPTS = 5;

export function nextRefundAttempt(attempts: number, now = Date.now()) {
  const delayMs = Math.min(60_000 * 2 ** Math.max(attempts - 1, 0), 60 * 60_000);
  return new Date(now + delayMs);
}
