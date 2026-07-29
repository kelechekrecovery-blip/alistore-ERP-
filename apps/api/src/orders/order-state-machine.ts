import { OrderLineFulfillmentStatus, OrderStatus } from '@prisma/client';
import { ValidationError } from '../common/errors';

/**
 * Order state machine (screen «AliStore Order State Machine»).
 * Canonical chain:
 *   draft → created → awaiting_confirmation → confirmed → reserved →
 *   awaiting_payment → paid → picking → packed →
 *   (ready_for_pickup | courier_assigned → out_for_delivery → delivered) → completed
 * Alternatives: cancelled, return_requested, returned, exchanged, refunded.
 *
 * POS/web direct sales may skip confirmation, so `created → reserved` and
 * `reserved → paid` are valid edges. Transitions are pure and enforced server-side;
 * the Orders/PaymentsService only ever changes status through assertTransition().
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['created', 'cancelled'],
  created: ['awaiting_confirmation', 'confirmed', 'reserved', 'cancelled'],
  awaiting_confirmation: ['confirmed', 'cancelled'],
  confirmed: ['reserved', 'cancelled'],
  reserved: ['awaiting_payment', 'paid', 'picking', 'cancelled'],
  // A to-order checkout enters awaiting_payment before procurement exists.
  // Confirming its deposit creates draft POs and returns the aggregate order to
  // confirmed while line-level states carry the remaining payment timeline.
  awaiting_payment: ['confirmed', 'paid', 'cancelled'],
  paid: ['picking', 'ready_for_pickup', 'courier_assigned', 'return_requested', 'refunded', 'exchanged'],
  picking: ['packed', 'cancelled'],
  packed: ['ready_for_pickup', 'courier_assigned'],
  ready_for_pickup: ['completed', 'return_requested'],
  courier_assigned: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: ['completed', 'return_requested', 'exchanged'],
  completed: ['return_requested', 'exchanged'],
  return_requested: ['returned', 'cancelled'],
  returned: ['refunded', 'exchanged'],
  exchanged: [],
  refunded: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throws 422 when the transition is not permitted by the state machine. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new ValidationError(
      'illegal_transition',
      `Недопустимый переход заказа: ${from} → ${to}`,
    );
  }
}

const TERMINAL_LINE_STATUSES = new Set<OrderLineFulfillmentStatus>([
  'handed_over',
  'customer_cancelled',
  'cancelled',
]);

/**
 * Backward-compatible aggregate projection for existing clients.
 * Line fulfillment is authoritative; callers must not maintain local variants.
 */
export function deriveOrderStatusFromLineFulfillment(
  statuses: OrderLineFulfillmentStatus[],
): Extract<OrderStatus, 'confirmed' | 'ready_for_pickup' | 'completed'> {
  const active = statuses.filter((status) => !TERMINAL_LINE_STATUSES.has(status));
  if (active.length === 0) return 'completed';
  if (active.every((status) => status === 'ready')) return 'ready_for_pickup';
  return 'confirmed';
}
