import { Prisma, ReturnStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ReturnSelectionDto } from './returns.dto';
import { OutboxService } from '../outbox/outbox.service';
export declare class ReturnsService {
    private readonly prisma;
    private readonly audit;
    private readonly outbox?;
    constructor(prisma: PrismaService, audit: AuditService, outbox?: OutboxService | undefined);
    get(id: string): Prisma.Prisma__ReturnClient<({
        items: {
            id: string;
            createdAt: Date;
            returnId: string;
            qty: number;
            orderItemId: string;
            refundAmount: number;
        }[];
    } & {
        id: string;
        idempotencyKey: string | null;
        orderId: string;
        status: import(".prisma/client").$Enums.ReturnStatus;
        createdAt: Date;
        reason: string;
        refundId: string | null;
        refundAmount: number;
        isFullOrder: boolean;
        restockLocation: string | null;
        restockedAt: Date | null;
    }) | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
    list(status?: string): Prisma.PrismaPromise<({
        order: {
            id: string;
            payments: {
                id: string;
                amount: number;
                method: import(".prisma/client").$Enums.PaymentMethod;
            }[];
            total: number;
            items: {
                id: string;
                sku: string;
                price: number;
                qty: number;
            }[];
        };
        refund: {
            id: string;
            amount: number;
            status: import(".prisma/client").$Enums.RefundStatus;
            allocations: {
                id: string;
                amount: number;
                status: import(".prisma/client").$Enums.RefundAllocationStatus;
                lastError: string | null;
                methodSnapshot: import(".prisma/client").$Enums.PaymentMethod;
                providerRefundId: string | null;
            }[];
        } | null;
        items: {
            id: string;
            createdAt: Date;
            returnId: string;
            qty: number;
            orderItemId: string;
            refundAmount: number;
        }[];
    } & {
        id: string;
        idempotencyKey: string | null;
        orderId: string;
        status: import(".prisma/client").$Enums.ReturnStatus;
        createdAt: Date;
        reason: string;
        refundId: string | null;
        refundAmount: number;
        isFullOrder: boolean;
        restockLocation: string | null;
        restockedAt: Date | null;
    })[]>;
    listByCustomer(customerId: string): Promise<{
        order: {
            id: string;
            createdAt: Date;
            total: number;
            items: {
                id: string;
                taxCode: string;
                taxRateBps: number;
                taxAmount: number;
                orderId: string;
                unitCost: number;
                productId: string | null;
                imei: string | null;
                sku: string;
                price: number;
                taxBaseAmount: number;
                qty: number;
                lineNumber: number;
                discountAmount: number;
                supplyModeSnapshot: import(".prisma/client").$Enums.SupplyMode;
                supplierIdSnapshot: string | null;
                supplyLeadDaysSnapshot: number | null;
                promisedDate: Date | null;
                fulfillmentStatus: import(".prisma/client").$Enums.OrderLineFulfillmentStatus;
                readyAt: Date | null;
                handedOverAt: Date | null;
                inventorySnapshot: Prisma.JsonValue | null;
            }[];
        };
        items: {
            id: string;
            createdAt: Date;
            returnId: string;
            qty: number;
            orderItemId: string;
            refundAmount: number;
        }[];
        id: string;
        idempotencyKey: string | null;
        orderId: string;
        status: import(".prisma/client").$Enums.ReturnStatus;
        createdAt: Date;
        reason: string;
        refundId: string | null;
        refundAmount: number;
        isFullOrder: boolean;
        restockLocation: string | null;
        restockedAt: Date | null;
    }[]>;
    request(orderId: string, reason: string, requester?: string, expectedCustomerId?: string, idempotencyKey?: string, selections?: ReturnSelectionDto[]): Promise<{
        items: {
            id: string;
            createdAt: Date;
            returnId: string;
            qty: number;
            orderItemId: string;
            refundAmount: number;
        }[];
    } & {
        id: string;
        idempotencyKey: string | null;
        orderId: string;
        status: import(".prisma/client").$Enums.ReturnStatus;
        createdAt: Date;
        reason: string;
        refundId: string | null;
        refundAmount: number;
        isFullOrder: boolean;
        restockLocation: string | null;
        restockedAt: Date | null;
    }>;
    transition(id: string, status: ReturnStatus, actor: string, location?: string): Promise<{
        id: string;
        idempotencyKey: string | null;
        orderId: string;
        status: import(".prisma/client").$Enums.ReturnStatus;
        createdAt: Date;
        reason: string;
        refundId: string | null;
        refundAmount: number;
        isFullOrder: boolean;
        restockLocation: string | null;
        restockedAt: Date | null;
    }>;
    private reconcileOnTx;
}
