import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnitsService } from '../units/units.service';
type OrderItemHandoverResult = {
    orderId: string;
    orderItemId: string;
    fulfillmentStatus: 'handed_over';
    handedOverAt: string;
    orderStatus: string;
    accountingEntryId: string;
};
export declare class OrderItemHandoverService {
    private readonly prisma;
    private readonly audit;
    private readonly units;
    private readonly config?;
    constructor(prisma: PrismaService, audit: AuditService, units: UnitsService, config?: ConfigService | undefined);
    handOver(orderId: string, orderItemId: string, actor: string, idempotencyKey: string): Promise<OrderItemHandoverResult>;
}
export {};
