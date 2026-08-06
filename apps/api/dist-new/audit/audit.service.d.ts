import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export interface AuditInput {
    type: string;
    actor: string;
    payload: Record<string, unknown>;
    refs?: string[];
}
export declare class AuditService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<{
        result: T;
        events: AuditInput[];
    }>, options?: {
        timeout?: number;
        maxWait?: number;
    }): Promise<T>;
    find(where: Prisma.AuditEventWhereInput): Promise<{
        id: string;
        type: string;
        actor: string;
        ts: Date;
        payload: Prisma.JsonValue;
        refs: string[];
    }[]>;
}
