import { AuthzService } from '../authz/authz.service';
import { WarrantyService } from './warranty.service';
import { OpenWarrantyDto, WarrantyStatusDto } from './warranty.dto';
import { AuthPrincipal } from '../auth/jwt.strategy';
export declare class WarrantyController {
    private readonly warranty;
    private readonly authz;
    constructor(warranty: WarrantyService, authz: AuthzService);
    list(customerId?: string, imei?: string, status?: string): import(".prisma/client").Prisma.PrismaPromise<{
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
    getOne(id: string): Promise<{
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
    open(dto: OpenWarrantyDto, user?: AuthPrincipal, capability?: string, idempotencyKey?: string): Promise<{
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
    transition(user: AuthPrincipal, id: string, dto: WarrantyStatusDto): Promise<{
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
