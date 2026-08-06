import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationTransport, OutboxInput } from './outbox.types';
export declare class OutboxService {
    private readonly prisma;
    private readonly transport;
    private readonly audit?;
    private readonly logger;
    constructor(prisma: PrismaService, transport: NotificationTransport, audit?: AuditService | undefined);
    enqueueOnTx(tx: Prisma.TransactionClient, input: OutboxInput): Promise<void>;
    enqueue(input: OutboxInput): Promise<void>;
    relayPending(limit?: number): Promise<{
        sent: number;
        failed: number;
    }>;
    private deliverTelegramAgentReply;
    redrive(id: string, actor: string): Promise<{
        id: string;
        payload: Prisma.JsonValue;
        status: import(".prisma/client").$Enums.OutboxStatus;
        createdAt: Date;
        channel: string;
        attempts: number;
        recipient: string;
        template: string;
        processingToken: string | null;
        lastError: string | null;
        nextAttemptAt: Date | null;
        sentAt: Date | null;
        campaignId: string | null;
    }>;
    private toData;
}
