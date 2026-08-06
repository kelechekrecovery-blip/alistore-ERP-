import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnitsService } from '../units/units.service';
export declare class OrderItemReservationService {
    private readonly prisma;
    private readonly audit;
    private readonly units;
    private readonly outbox;
    private readonly config?;
    constructor(prisma: PrismaService, audit: AuditService, units: UnitsService, outbox: OutboxService, config?: ConfigService | undefined);
    reserve(orderId: string, orderItemId: string, actor: string, key: string): Promise<unknown>;
    ready(orderId: string, orderItemId: string, actor: string, key: string): Promise<unknown>;
    private assertEnabled;
    private command;
}
