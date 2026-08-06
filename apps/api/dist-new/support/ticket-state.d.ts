import { TicketStatus } from '@prisma/client';
export declare const TICKET_OPEN_STATUSES: TicketStatus[];
export declare function assertTicketTransition(from: TicketStatus, to: TicketStatus): void;
export declare const PRIORITY_LADDER: readonly ["normal", "high", "urgent"];
export type Priority = (typeof PRIORITY_LADDER)[number];
export declare function normalizePriority(p?: string): Priority;
export declare function slaFor(priority: Priority, from: number): Date;
export declare function escalatedPriority(current: string): Priority | null;
