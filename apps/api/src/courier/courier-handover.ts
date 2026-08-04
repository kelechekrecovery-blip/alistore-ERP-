import { ConflictError, ForbiddenError } from '../common/errors';

export type CourierHandoverPayload = {
  amount: number;
  reason: string | null;
};

export function replayCourierHandover<T extends {
  id: string;
  courierId: string;
  codTotal: number;
  collectedTotal?: number;
  handoverAmount: number | null;
  handoverReason: string | null;
}>(run: T, runId: string, payload: CourierHandoverPayload): T & { diff: number } {
  const same = run.id === runId && run.handoverAmount === payload.amount && run.handoverReason === payload.reason;
  if (!same) throw new ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован другой COD-сдачей');
  // Handovers reconcile against the collected cash; runs without order tracking used codTotal.
  return { ...run, diff: payload.amount - (run.collectedTotal ?? run.codTotal) };
}

export function assertCourierRunOwner(run: { courierId: string }, expectedCourierId?: string): void {
  if (expectedCourierId && run.courierId !== expectedCourierId) {
    throw new ForbiddenError('courier_run_forbidden', 'Рейс назначен другому курьеру');
  }
}
