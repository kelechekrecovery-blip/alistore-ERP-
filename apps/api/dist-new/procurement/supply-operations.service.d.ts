import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export declare const SUPPLY_OPERATION_QUEUE_KEYS: readonly ["awaiting_deposit", "draft_po", "late", "received", "ready", "cancellation_awaiting_owner", "refund_failed"];
export type SupplyOperationQueueKey = (typeof SUPPLY_OPERATION_QUEUE_KEYS)[number];
type SupplyOperationRow = {
    id: string;
    queue: SupplyOperationQueueKey;
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
};
export declare class SupplyOperationsService {
    private readonly prisma;
    private readonly config;
    constructor(prisma: PrismaService, config: ConfigService);
    list(role: string | undefined, now?: Date): Promise<{
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
        counts: Record<SupplyOperationQueueKey, number>;
        queues: Record<"received" | "ready" | "awaiting_deposit" | "late" | "refund_failed" | "draft_po" | "cancellation_awaiting_owner", SupplyOperationRow[]>;
    }>;
}
export {};
