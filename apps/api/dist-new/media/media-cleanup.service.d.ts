import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from './media.service';
export declare class MediaCleanupService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly media;
    private readonly logger;
    private timer?;
    constructor(prisma: PrismaService, media: MediaService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    deleteOrSchedule(objectKey: string): Promise<void>;
    registerIntent(objectKey: string): Promise<void>;
    markRetainedOnTx(tx: Prisma.TransactionClient, objectKey: string): Promise<void>;
    runPendingCleanup(): Promise<void>;
    retryPending(limit?: number): Promise<{
        completed: number;
        failed: number;
    }>;
    private finalizeDeletePass;
    private claim;
}
