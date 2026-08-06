import { RmaStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SupplierScore } from './scorecard';
export declare const RMA_SLA_DAYS = 30;
export declare class SupplierRmaService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    createSupplier(input: {
        name: string;
        contact?: string;
    }): import(".prisma/client").Prisma.Prisma__SupplierClient<{
        id: string;
        name: string;
        createdAt: Date;
        contact: string | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs>;
    listSuppliers(): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        name: string;
        createdAt: Date;
        contact: string | null;
    }[]>;
    listRmas(filter: {
        supplierId?: string;
        status?: string;
    }): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        status: import(".prisma/client").$Enums.RmaStatus;
        createdAt: Date;
        imei: string;
        supplierId: string;
        sla: Date;
        defect: string;
        resolution: string | null;
    }[]>;
    open(input: {
        supplierId: string;
        imei: string;
        defect: string;
    }, actor: string): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.RmaStatus;
        createdAt: Date;
        imei: string;
        supplierId: string;
        sla: Date;
        defect: string;
        resolution: string | null;
    }>;
    transition(id: string, to: RmaStatus, actor: string): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.RmaStatus;
        createdAt: Date;
        imei: string;
        supplierId: string;
        sla: Date;
        defect: string;
        resolution: string | null;
    }>;
    scorecard(): Promise<SupplierScore[]>;
}
