import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class ServiceSlaService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    escalateOverdue(now?: Date): Promise<{
        escalated: number;
    }>;
    escalateOverdueLoaners(now?: Date): Promise<{
        escalated: number;
    }>;
}
