import { AuthPrincipal } from '../auth/jwt.strategy';
import { ProposeSupplyQuarantineDto, ResolveSupplyQuarantineDto } from './supply-quarantine.dto';
import { SupplyQuarantineService } from './supply-quarantine.service';
export declare class SupplyQuarantineController {
    private readonly quarantines;
    constructor(quarantines: SupplyQuarantineService);
    propose(user: AuthPrincipal, orderItemId: string, idempotencyKey: string | undefined, dto: ProposeSupplyQuarantineDto): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.SupplyQuarantineStatus;
        createdAt: Date;
        productId: string;
        storePointId: string;
        resolvedBy: string | null;
        resolvedAt: Date | null;
        orderLineSupplyId: string;
        disposition: import(".prisma/client").$Enums.SupplyQuarantineDisposition | null;
        imeis: import("@prisma/client/runtime/library").JsonValue;
        inventoryLocationSnapshot: string;
        trackingModeSnapshot: import(".prisma/client").$Enums.StockTrackingMode;
        quarantinedQty: number;
        proposalReason: string;
        proposedBy: string;
        resolutionReason: string | null;
        inventoryMovementId: string | null;
    } & {
        idempotent: boolean;
    }>;
    resolve(user: AuthPrincipal, id: string, idempotencyKey: string | undefined, dto: ResolveSupplyQuarantineDto): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.SupplyQuarantineStatus;
        createdAt: Date;
        productId: string;
        storePointId: string;
        resolvedBy: string | null;
        resolvedAt: Date | null;
        orderLineSupplyId: string;
        disposition: import(".prisma/client").$Enums.SupplyQuarantineDisposition | null;
        imeis: import("@prisma/client/runtime/library").JsonValue;
        inventoryLocationSnapshot: string;
        trackingModeSnapshot: import(".prisma/client").$Enums.StockTrackingMode;
        quarantinedQty: number;
        proposalReason: string;
        proposedBy: string;
        resolutionReason: string | null;
        inventoryMovementId: string | null;
    } & {
        idempotent: boolean;
    }>;
}
