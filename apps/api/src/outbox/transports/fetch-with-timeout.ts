/**
 * Outbox providers must never hold a worker forever on a stalled network
 * connection. An AbortError is intentionally allowed to bubble to OutboxService
 * so the message follows the normal retry/backoff path.
 */
export function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
