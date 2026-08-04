import { RmaStatus } from '@prisma/client';
import { ValidationError } from '../common/errors';

/**
 * Supplier RMA state machine. A defective unit is shipped to the supplier, who
 * accepts (or rejects on receipt) and then resolves it. Resolution statuses and
 * `rejected` are terminal-before-close; `closed` is final.
 */
const TRANSITIONS: Record<RmaStatus, RmaStatus[]> = {
  created: ['shipped'],
  shipped: ['accepted', 'rejected'],
  accepted: ['repaired', 'replaced', 'refunded', 'rejected'],
  repaired: ['closed'],
  replaced: ['closed'],
  refunded: ['closed'],
  rejected: ['closed'],
  closed: [],
};

/** Statuses that record a final outcome (drive the supplier scorecard). */
export const RMA_RESOLUTIONS: RmaStatus[] = ['repaired', 'replaced', 'refunded', 'rejected'];

/** In-flight statuses: still owed by the supplier, counted against SLA. */
export const RMA_OPEN_STATUSES: RmaStatus[] = ['created', 'shipped', 'accepted'];

export function assertRmaTransition(from: RmaStatus, to: RmaStatus): void {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new ValidationError(
      'illegal_rma_transition',
      `Недопустимый переход RMA: ${from} → ${to}`,
    );
  }
}
