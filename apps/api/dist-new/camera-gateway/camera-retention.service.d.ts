import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class CameraRetentionService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly audit;
    private readonly logger;
    private timer?;
    constructor(prisma: PrismaService, audit: AuditService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    purgeExpired(now?: Date, limit?: number): Promise<number>;
}
