import { TicketStatus } from '@prisma/client';
import { ValidationError } from '../common/errors';

/**
 * Support ticket state machine. A ticket is triaged (new), worked (in_progress),
 * may await the customer (waiting), then resolved and closed. Resolved can reopen.
 */
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  new: ['in_progress', 'closed'],
  in_progress: ['waiting', 'resolved'],
  waiting: ['in_progress', 'resolved'],
  resolved: ['closed', 'in_progress'],
  closed: [],
};

/** Statuses that still owe a response — counted against SLA in the Risk Center. */
export const TICKET_OPEN_STATUSES: TicketStatus[] = ['new', 'in_progress', 'waiting'];

export function assertTicketTransition(from: TicketStatus, to: TicketStatus): void {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new ValidationError(
      'illegal_ticket_transition',
      `Недопустимый переход тикета: ${from} → ${to}`,
    );
  }
}

/** Priority ladder low→high; escalation moves one step up. */
export const PRIORITY_LADDER = ['normal', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITY_LADDER)[number];

/** SLA window in hours per priority (drives the ticket deadline). */
const SLA_HOURS: Record<Priority, number> = { normal: 72, high: 24, urgent: 4 };

export function normalizePriority(p?: string): Priority {
  return (PRIORITY_LADDER as readonly string[]).includes(p ?? '') ? (p as Priority) : 'normal';
}

export function slaFor(priority: Priority, from: number): Date {
  return new Date(from + SLA_HOURS[priority] * 60 * 60 * 1000);
}

/** Next priority up the ladder, or null if already at the top. */
export function escalatedPriority(current: string): Priority | null {
  const idx = PRIORITY_LADDER.indexOf(normalizePriority(current));
  return idx < PRIORITY_LADDER.length - 1 ? PRIORITY_LADDER[idx + 1] : null;
}
