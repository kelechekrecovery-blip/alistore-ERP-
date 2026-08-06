import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProposeSupplyQuarantineDto, ResolveSupplyQuarantineDto } from './supply-quarantine.dto';
declare const PUBLIC_SELECT: {
    id: true;
    orderLineSupplyId: true;
    productId: true;
    storePointId: true;
    inventoryLocationSnapshot: true;
    trackingModeSnapshot: true;
    quarantinedQty: true;
    imeis: true;
    status: true;
    disposition: true;
    proposalReason: true;
    proposedBy: true;
    resolutionReason: true;
    resolvedBy: true;
    inventoryMovementId: true;
    createdAt: true;
    resolvedAt: true;
};
type PublicResolution = Prisma.SupplyQuarantineResolutionGetPayload<{
    select: typeof PUBLIC_SELECT;
}>;
export declare class SupplyQuarantineService {
    private readonly prisma;
    private readonly audit;
    private readonly config?;
    constructor(prisma: PrismaService, audit: AuditService, config?: ConfigService | undefined);
    propose(orderItemId: string, dto: ProposeSupplyQuarantineDto, actor: string, idempotencyKey: string): Promise<PublicResolution & {
        idempotent: boolean;
    }>;
    resolve(resolutionId: string, dto: ResolveSupplyQuarantineDto, actor: string, role: string | undefined, idempotencyKey: string): Promise<PublicResolution & {
        idempotent: boolean;
    }>;
    private assertEnabled;
    private consumeQuantityAllocationsOnTx;
    private convertToOwnStock;
    private returnToSupplier;
}
export {};
