import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
import { UnitsService } from '../units/units.service';
export interface OrderInventorySnapshot {
    productId: string;
    trackingMode: 'serialized' | 'quantity';
    components: Array<{
        productId: string;
        sku: string;
        trackingMode: 'serialized' | 'quantity';
        qty: number;
    }>;
}
export declare function parseOrderInventorySnapshot(value: Prisma.JsonValue | null): OrderInventorySnapshot | null;
export declare function resolveOrderInventorySnapshot(value: Prisma.JsonValue | null, fallback: OrderInventorySnapshot | null): OrderInventorySnapshot | null;
export declare function assertOrderLineSupplyReceived(orderId: string, items: Array<{
    id: string;
    sku: string;
    supplyModeSnapshot: string;
}>, supplyByOrderItemId: Map<string, {
    status: string;
}>): void;
export declare function finalizeOrderInventorySaleOnTx(tx: Prisma.TransactionClient, input: {
    orderId: string;
    actor: string;
    units: UnitsService;
    events: AuditInput[];
}): Promise<{
    serialized: number;
    quantityAllocations: number;
}>;
export declare function finalizeOrderItemInventorySaleOnTx(tx: Prisma.TransactionClient, input: {
    orderId: string;
    orderItemId: string;
    actor: string;
    units: UnitsService;
    events: AuditInput[];
}): Promise<{
    serialized: number;
    quantityAllocations: number;
}>;
export declare function orderHasTrackedInventoryOnTx(tx: Prisma.TransactionClient, orderId: string): Promise<boolean>;
export declare function assertOrderReservationCoverageOnTx(tx: Prisma.TransactionClient, orderId: string, now?: Date, options?: {
    enforceExpiry?: boolean;
}): Promise<{
    serialized: number;
    quantity: number;
}>;
export declare function assertOrderInventoryFinalizedOnTx(tx: Prisma.TransactionClient, orderId: string): Promise<void>;
export declare function lockInventoryBalancesOnTx(tx: Prisma.TransactionClient, balanceIds: string[]): Promise<void>;
