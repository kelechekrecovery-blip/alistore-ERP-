import { ReturnsService } from './returns.service';
import { CreateMineReturnDto, CreateReturnDto, ReturnStatusDto } from './returns.dto';
import { AuthPrincipal } from '../auth/jwt.strategy';
export declare class ReturnsController {
    private readonly returns;
    constructor(returns: ReturnsService);
    mine(user: AuthPrincipal): Promise<{
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
                inventorySnapshot: import("@prisma/client/runtime/library").JsonValue | null;
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
    createMine(user: AuthPrincipal, idempotencyKey: string | undefined, dto: CreateMineReturnDto): Promise<{
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
    list(status?: string): import(".prisma/client").Prisma.PrismaPromise<({
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
    get(id: string): Promise<{
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
    create(user: AuthPrincipal, dto: CreateReturnDto): Promise<{
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
    transition(user: AuthPrincipal, id: string, dto: ReturnStatusDto): Promise<{
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
}
