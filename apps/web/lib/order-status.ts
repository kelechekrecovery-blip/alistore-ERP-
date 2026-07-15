import type { LedgerEvent } from './reports';

export type StepState = 'done' | 'current' | 'future';

export interface TimelineStep {
  title: string;
  state: StepState;
  time: string | null; // ISO ts of the ledger event that completed the step
}

/** Canonical customer-facing fulfillment steps, each satisfied by any of its events. */
const STEPS: { title: string; events: string[] }[] = [
  { title: 'Оформлен', events: ['order.created', 'order.confirmed'] },
  { title: 'Оплачен', events: ['order.paid', 'payment.received', 'debt.settled'] },
  { title: 'Сборка', events: ['order.picking', 'order.reserved'] },
  { title: 'Готов к выдаче', events: ['order.packed', 'order.ready_for_pickup', 'delivery.out'] },
  { title: 'Выдан', events: ['order.completed', 'delivery.delivered'] },
];

/** Terminal states that break the normal flow (shown separately, not as a step). */
export const TERMINAL_BAD: Record<string, string> = {
  cancelled: 'Заказ отменён',
  refunded: 'Возврат денег оформлен',
  returned: 'Товар возвращён',
  exchanged: 'Оформлен обмен',
};

/**
 * Build the order tracking timeline from the ledger. A step is `done` when one of
 * its events exists (timestamped from that event); the first not-yet-done step is
 * `current`; the rest are `future`. Fully-completed orders have every step done.
 * Pure — all events are supplied by the caller.
 */
export function buildOrderTimeline(ledger: Array<Pick<LedgerEvent, 'type' | 'ts'>>): TimelineStep[] {
  const firstTs = (types: string[]): string | null => {
    const hits = ledger
      .filter((e) => types.includes(e.type))
      .map((e) => e.ts)
      .sort();
    return hits[0] ?? null;
  };

  const raw = STEPS.map((s) => ({ title: s.title, time: firstTs(s.events) }));
  const firstPending = raw.findIndex((s) => s.time === null);

  return raw.map((s, i) => {
    let state: StepState;
    if (firstPending === -1) state = 'done';
    else if (i < firstPending) state = 'done';
    else if (i === firstPending) state = 'current';
    else state = 'future';
    return { title: s.title, state, time: s.time };
  });
}
