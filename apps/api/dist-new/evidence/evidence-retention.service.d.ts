import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class EvidenceRetentionService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly media;
    private readonly audit;
    private readonly logger;
    private timer?;
    constructor(prisma: PrismaService, media: MediaService, audit: AuditService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    runDuePurges(limit?: number): Promise<{
        purged: number;
        failed: number;
    }>;
    private recordFailure;
}
