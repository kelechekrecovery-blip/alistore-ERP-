import { Prisma, WarrantyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
export declare const WARRANTY_SLA_DAYS = 14;
export declare class WarrantyService {
    private readonly prisma;
    private readonly audit;
    private readonly outbox?;
    constructor(prisma: PrismaService, audit: AuditService, outbox?: OutboxService | undefined);
    get(id: string): Prisma.Prisma__WarrantyCaseClient<{
        id: string;
        status: import(".prisma/client").$Enums.WarrantyStatus;
        imei: string;
        customerId: string;
        assignee: string | null;
        problem: string;
        serviceType: import(".prisma/client").$Enums.ServiceCaseType;
        deviceName: string | null;
        sla: Date;
        slaEscalatedAt: Date | null;
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
    list(filter: {
        customerId?: string;
        imei?: string;
        status?: string;
    }): Prisma.PrismaPromise<{
        id: string;
        status: import(".prisma/client").$Enums.WarrantyStatus;
        imei: string;
        customerId: string;
        assignee: string | null;
        problem: string;
        serviceType: import(".prisma/client").$Enums.ServiceCaseType;
        deviceName: string | null;
        sla: Date;
        slaEscalatedAt: Date | null;
    }[]>;
    open(input: {
        imei: string;
        customerId: string;
        problem: string;
    }, actor: string, idempotencyKey?: string): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.WarrantyStatus;
        imei: string;
        customerId: string;
        assignee: string | null;
        problem: string;
        serviceType: import(".prisma/client").$Enums.ServiceCaseType;
        deviceName: string | null;
        sla: Date;
        slaEscalatedAt: Date | null;
    }>;
    private replayOpen;
    transition(id: string, to: WarrantyStatus, actor: string): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.WarrantyStatus;
        imei: string;
        customerId: string;
        assignee: string | null;
        problem: string;
        serviceType: import(".prisma/client").$Enums.ServiceCaseType;
        deviceName: string | null;
        sla: Date;
        slaEscalatedAt: Date | null;
    }>;
}
