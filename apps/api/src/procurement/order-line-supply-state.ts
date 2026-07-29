import { OrderLineSupplyStatus } from '@prisma/client';
import { ValidationError } from '../common/errors';

/**
 * Order-line supply state machine (docs/SUPPLY-TO-ORDER-PLAN.md, slice 3).
 * Commercial chain: awaiting_deposit → procurement_draft → ordered → in_transit
 * → received → quality_check → ready → handed_over. `awaiting_supplier` remains
 * as a compatibility state for orders created by the earlier request-only slice.
 * Exception states are explicit so the ledger can distinguish supplier failure,
 * lateness, customer cancellation and quarantined goods.
 */
export const ALLOWED_TRANSITIONS: Record<OrderLineSupplyStatus, OrderLineSupplyStatus[]> = {
  awaiting_deposit: ['procurement_draft', 'customer_cancelled', 'cancelled'],
  awaiting_supplier: ['procurement_draft', 'ordered', 'customer_cancelled', 'cancelled'],
  procurement_draft: ['ordered', 'customer_cancelled', 'cancelled'],
  ordered: ['in_transit', 'supplier_rejected', 'late', 'customer_cancelled', 'cancelled'],
  in_transit: ['received', 'late', 'customer_cancelled', 'cancelled'],
  received: ['quality_check', 'quarantined', 'cancelled'],
  quality_check: ['ready', 'quarantined', 'cancelled'],
  ready: ['handed_over', 'customer_cancelled', 'quarantined', 'cancelled'],
  supplier_rejected: ['cancelled'],
  late: ['in_transit', 'received', 'supplier_rejected', 'customer_cancelled', 'cancelled'],
  customer_cancelled: ['quarantined', 'cancelled'],
  quarantined: ['ready', 'cancelled'],
  handed_over: [],
  cancelled: [],
};

export function canTransition(from: OrderLineSupplyStatus, to: OrderLineSupplyStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throws 422 when the transition is not permitted by the state machine. */
export function assertTransition(from: OrderLineSupplyStatus, to: OrderLineSupplyStatus): void {
  if (!canTransition(from, to)) {
    throw new ValidationError(
      'illegal_supply_transition',
      `Недопустимый переход поставки строки заказа: ${from} → ${to}`,
    );
  }
}

/** A `to_order` line is real stock once its supply has actually arrived. */
export function isSupplyFulfilled(status: OrderLineSupplyStatus): boolean {
  return ['received', 'quality_check', 'ready', 'handed_over'].includes(status);
}
