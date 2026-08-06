import { ConfigService } from '@nestjs/config';
import { HealthCheckService, MemoryHealthIndicator, PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
export declare class HealthController {
    private readonly health;
    private readonly db;
    private readonly memory;
    private readonly prisma;
    private readonly config;
    constructor(health: HealthCheckService, db: PrismaHealthIndicator, memory: MemoryHealthIndicator, prisma: PrismaService, config: ConfigService);
    check(): Promise<{
        status: "ok";
    }>;
    ready(): Promise<{
        status: "ok";
    }>;
    live(): {
        status: "ok";
    };
    details(): Promise<import("@nestjs/terminus").HealthCheckResult<import("@nestjs/terminus").HealthIndicatorResult<string, import("@nestjs/terminus").HealthIndicatorStatus, Record<string, any>> & import("@nestjs/terminus").HealthIndicatorResult<"memory_heap"> & import("@nestjs/terminus").HealthIndicatorResult<"database">, Partial<import("@nestjs/terminus").HealthIndicatorResult<string, import("@nestjs/terminus").HealthIndicatorStatus, Record<string, any>> & import("@nestjs/terminus").HealthIndicatorResult<"memory_heap"> & import("@nestjs/terminus").HealthIndicatorResult<"database">> | undefined, Partial<import("@nestjs/terminus").HealthIndicatorResult<string, import("@nestjs/terminus").HealthIndicatorStatus, Record<string, any>> & import("@nestjs/terminus").HealthIndicatorResult<"memory_heap"> & import("@nestjs/terminus").HealthIndicatorResult<"database">> | undefined>>;
    private probe;
    integrations(): Promise<{
        backup: {
            lastFailureAt: string | null;
            status: import("../ops/backup-status").BackupFreshnessStatus;
            ageHours: number | null;
            lastSuccessAt: string | null;
        };
        status: "ready" | "blocked";
        generatedAt: string;
        summary: {
            ready: number;
            missing: number;
            manualRequired: number;
            optional: number;
            blockingRemaining: number;
        };
        checks: import("./external-readiness").ExternalReadinessCheck[];
        nextActions: string[];
    }>;
    private backupFreshness;
}
