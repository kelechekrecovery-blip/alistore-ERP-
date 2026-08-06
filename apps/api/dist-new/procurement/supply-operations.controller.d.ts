import { AuthPrincipal } from '../auth/jwt.strategy';
import { SupplyOperationsService } from './supply-operations.service';
export declare class SupplyOperationsController {
    private readonly operations;
    constructor(operations: SupplyOperationsService);
    list(user: AuthPrincipal): Promise<{
        generatedAt: Date;
        flags: {
            checkoutEnabled: boolean;
            cancellationEnabled: boolean;
            autoRefundEnabled: boolean;
            ownerResolutionEnabled: boolean;
        };
        capabilities: {
            financialQueuesVisible: boolean;
            ownerResolutionAvailable: boolean;
        };
        counts: Record<import("./supply-operations.service").SupplyOperationQueueKey, number>;
        queues: Record<"received" | "ready" | "awaiting_deposit" | "late" | "refund_failed" | "draft_po" | "cancellation_awaiting_owner", {
            id: string;
            queue: import("./supply-operations.service").SupplyOperationQueueKey;
            orderId: string;
            purchaseOrderId: string | null;
            purchaseOrderNumber: string | null;
            status: string;
            amount: number | null;
            expectedAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
            sku: string | null;
            quantity: number | null;
            detailHref: string;
        }[]>;
    }>;
}
