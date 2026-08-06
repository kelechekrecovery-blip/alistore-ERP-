declare const CHANNELS: readonly ["web", "app", "whatsapp", "telegram", "call", "store"];
declare const TRANSITION_TARGETS: readonly ["in_progress", "waiting", "resolved", "closed"];
export declare class OpenTicketDto {
    customerId: string;
    channel: (typeof CHANNELS)[number];
    subject: string;
    body?: string;
    priority?: string;
    actor?: string;
}
export declare class OpenMineTicketDto {
    channel: (typeof CHANNELS)[number];
    subject: string;
    body?: string;
    priority?: string;
}
export declare class TicketTransitionDto {
    to: (typeof TRANSITION_TARGETS)[number];
    assignee?: string;
    actor?: string;
}
export declare class EscalateTicketDto {
    actor?: string;
}
export {};
