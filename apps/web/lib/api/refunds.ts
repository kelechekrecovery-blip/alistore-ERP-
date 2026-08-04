import { getJson, postAuthJson } from './http';
import type { RefundAggregate } from './payments';

/** Full refund aggregate: detail for the refunds ops screen (GET /refunds/:id). */
export function fetchRefund(id: string, accessToken: string): Promise<RefundAggregate> {
  return getJson(`/refunds/${encodeURIComponent(id)}`, accessToken);
}

/** Retry queued or failed refund allocations (POST /refunds/:id/retry). */
export function retryRefund(id: string, accessToken: string): Promise<RefundAggregate> {
  return postAuthJson(`/refunds/${encodeURIComponent(id)}/retry`, {}, accessToken);
}

/** Cancel an unexecuted failed refund after provider reconciliation. */
export function cancelRefund(
  id: string,
  input: { reason: string },
  accessToken: string,
  idempotencyKey: string,
): Promise<RefundAggregate> {
  return postAuthJson(
    `/refunds/${encodeURIComponent(id)}/cancel`,
    input,
    accessToken,
    { 'idempotency-key': idempotencyKey },
  );
}
