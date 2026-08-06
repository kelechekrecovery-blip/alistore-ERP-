import { TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { OpenTicketDto, TicketTransitionDto } from './support.dto';
export declare class SupportService {
    private readonly prisma;
    private readonly audit;
    private readonly outbox?;
    constructor(prisma: PrismaService, audit: AuditService, outbox?: OutboxService | undefined);
    get(id: string): import(".prisma/client").Prisma.Prisma__SupportTicketClient<{
        id: string;
        idempotencyKey: string | null;
        status: import(".prisma/client").$Enums.TicketStatus;
        createdAt: Date;
        subject: string;
        customerId: string;
        channel: string;
        body: string | null;
        priority: string;
        assignee: string | null;
        sla: Date;
        revision: number;
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
    list(filter: {
        customerId?: string;
        status?: string;
    }): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        idempotencyKey: string | null;
        status: import(".prisma/client").$Enums.TicketStatus;
        createdAt: Date;
        subject: string;
        customerId: string;
        channel: string;
        body: string | null;
        priority: string;
        assignee: string | null;
        sla: Date;
        revision: number;
    }[]>;
    open(dto: OpenTicketDto, actor: string, idempotencyKey?: string): Promise<{
        id: string;
        idempotencyKey: string | null;
        status: import(".prisma/client").$Enums.TicketStatus;
        createdAt: Date;
        subject: string;
        customerId: string;
        channel: string;
        body: string | null;
        priority: string;
        assignee: string | null;
        sla: Date;
        revision: number;
    }>;
    transition(id: string, to: TicketStatus, dto: TicketTransitionDto, actor: string): Promise<{
        id: string;
        idempotencyKey: string | null;
        status: import(".prisma/client").$Enums.TicketStatus;
        createdAt: Date;
        subject: string;
        customerId: string;
        channel: string;
        body: string | null;
        priority: string;
        assignee: string | null;
        sla: Date;
        revision: number;
    }>;
    escalate(id: string, actor: string): Promise<{
        id: string;
        idempotencyKey: string | null;
        status: import(".prisma/client").$Enums.TicketStatus;
        createdAt: Date;
        subject: string;
        customerId: string;
        channel: string;
        body: string | null;
        priority: string;
        assignee: string | null;
        sla: Date;
        revision: number;
    }>;
}
