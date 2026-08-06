import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UnitsService } from '../units/units.service';
import { OutboxService } from '../outbox/outbox.service';
export declare class ReservationsService {
    private readonly prisma;
    private readonly audit;
    private readonly units;
    private readonly outbox;
    constructor(prisma: PrismaService, audit: AuditService, units: UnitsService, outbox: OutboxService);
    releaseExpired(now?: Date): Promise<{
        released: number;
    }>;
}
