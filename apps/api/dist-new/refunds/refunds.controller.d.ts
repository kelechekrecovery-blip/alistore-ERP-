import { AuthPrincipal } from '../auth/jwt.strategy';
import { RetryRefundDto } from './refunds.dto';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { CancelRefundDto, CreateRefundDto, ResolveRefundDto } from './refunds.dto';
import { RefundProcessor } from './refunds.processor';
import { RefundsService } from './refunds.service';
export declare class RefundsController {
    private readonly refunds;
    private readonly processor;
    private readonly staffAuth;
    constructor(refunds: RefundsService, processor: RefundProcessor, staffAuth: StaffAuthService);
    create(user: AuthPrincipal, returnId: string, idempotencyKey: string | undefined, dto: CreateRefundDto): Promise<({
        return: ({
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
        }) | null;
        approval: {
            id: string;
            idempotencyKey: string | null;
            sourceRef: string | null;
            status: import(".prisma/client").$Enums.ApprovalStatus;
            createdAt: Date;
            consumedAt: Date | null;
            reason: string;
            evidence: import("@prisma/client/runtime/library").JsonValue | null;
            requester: string;
            approver: string | null;
            action: string;
        } | null;
        lines: ({
            returnItem: {
                id: string;
                createdAt: Date;
                returnId: string;
                qty: number;
                orderItemId: string;
                refundAmount: number;
            };
        } & {
            id: string;
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
            createdAt: Date;
            taxBaseAmount: number;
            qty: number;
            refundId: string;
            grossAmount: number;
            revenueAmount: number;
            returnItemId: string;
        })[];
        allocations: ({
            originalPayment: {
                id: string;
                idempotencyKey: string | null;
                point: string | null;
                accountCode: string | null;
                accountingEntryId: string | null;
                txnId: string | null;
                orderId: string | null;
                serviceWorkOrderId: string | null;
                originalPaymentId: string | null;
                giftCardId: string | null;
                amount: number;
                method: import(".prisma/client").$Enums.PaymentMethod;
                status: import(".prisma/client").$Enums.PaymentStatus;
                shiftId: string | null;
                receivedBy: string | null;
                createdAt: Date;
            };
            refundPayment: {
                id: string;
                idempotencyKey: string | null;
                point: string | null;
                accountCode: string | null;
                accountingEntryId: string | null;
                txnId: string | null;
                orderId: string | null;
                serviceWorkOrderId: string | null;
                originalPaymentId: string | null;
                giftCardId: string | null;
                amount: number;
                method: import(".prisma/client").$Enums.PaymentMethod;
                status: import(".prisma/client").$Enums.PaymentStatus;
                shiftId: string | null;
                receivedBy: string | null;
                createdAt: Date;
            } | null;
        } & {
            id: string;
            accountingEntryId: string | null;
            originalPaymentId: string;
            amount: number;
            status: import(".prisma/client").$Enums.RefundAllocationStatus;
            shiftId: string | null;
            createdAt: Date;
            updatedAt: Date;
            attempts: number;
            lastError: string | null;
            nextAttemptAt: Date | null;
            refundId: string;
            ordinal: number;
            methodSnapshot: import(".prisma/client").$Enums.PaymentMethod;
            providerRefundId: string | null;
            lockedAt: Date | null;
            refundPaymentId: string | null;
        })[];
    } & {
        id: string;
        idempotencyKey: string;
        orderId: string;
        amount: number;
        status: import(".prisma/client").$Enums.RefundStatus;
        createdAt: Date;
        updatedAt: Date;
        returnId: string | null;
        purpose: import(".prisma/client").$Enums.RefundPurpose;
        reason: string;
        approvalId: string | null;
        approvedAt: Date | null;
        completedAt: Date | null;
        requestHash: string;
        requester: string;
        approver: string | null;
    }) | null>;
    get(id: string): import(".prisma/client").Prisma.Prisma__RefundClient<({
        return: ({
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
        }) | null;
        approval: {
            id: string;
            idempotencyKey: string | null;
            sourceRef: string | null;
            status: import(".prisma/client").$Enums.ApprovalStatus;
            createdAt: Date;
            consumedAt: Date | null;
            reason: string;
            evidence: import("@prisma/client/runtime/library").JsonValue | null;
            requester: string;
            approver: string | null;
            action: string;
        } | null;
        lines: ({
            returnItem: {
                id: string;
                createdAt: Date;
                returnId: string;
                qty: number;
                orderItemId: string;
                refundAmount: number;
            };
        } & {
            id: string;
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
            createdAt: Date;
            taxBaseAmount: number;
            qty: number;
            refundId: string;
            grossAmount: number;
            revenueAmount: number;
            returnItemId: string;
        })[];
        allocations: ({
            originalPayment: {
                id: string;
                idempotencyKey: string | null;
                point: string | null;
                accountCode: string | null;
                accountingEntryId: string | null;
                txnId: string | null;
                orderId: string | null;
                serviceWorkOrderId: string | null;
                originalPaymentId: string | null;
                giftCardId: string | null;
                amount: number;
                method: import(".prisma/client").$Enums.PaymentMethod;
                status: import(".prisma/client").$Enums.PaymentStatus;
                shiftId: string | null;
                receivedBy: string | null;
                createdAt: Date;
            };
            refundPayment: {
                id: string;
                idempotencyKey: string | null;
                point: string | null;
                accountCode: string | null;
                accountingEntryId: string | null;
                txnId: string | null;
                orderId: string | null;
                serviceWorkOrderId: string | null;
                originalPaymentId: string | null;
                giftCardId: string | null;
                amount: number;
                method: import(".prisma/client").$Enums.PaymentMethod;
                status: import(".prisma/client").$Enums.PaymentStatus;
                shiftId: string | null;
                receivedBy: string | null;
                createdAt: Date;
            } | null;
        } & {
            id: string;
            accountingEntryId: string | null;
            originalPaymentId: string;
            amount: number;
            status: import(".prisma/client").$Enums.RefundAllocationStatus;
            shiftId: string | null;
            createdAt: Date;
            updatedAt: Date;
            attempts: number;
            lastError: string | null;
            nextAttemptAt: Date | null;
            refundId: string;
            ordinal: number;
            methodSnapshot: import(".prisma/client").$Enums.PaymentMethod;
            providerRefundId: string | null;
            lockedAt: Date | null;
            refundPaymentId: string | null;
        })[];
    } & {
        id: string;
        idempotencyKey: string;
        orderId: string;
        amount: number;
        status: import(".prisma/client").$Enums.RefundStatus;
        createdAt: Date;
        updatedAt: Date;
        returnId: string | null;
        purpose: import(".prisma/client").$Enums.RefundPurpose;
        reason: string;
        approvalId: string | null;
        approvedAt: Date | null;
        completedAt: Date | null;
        requestHash: string;
        requester: string;
        approver: string | null;
    }) | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
    retry(user: AuthPrincipal, id: string, dto?: RetryRefundDto): Promise<({
        return: ({
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
        }) | null;
        approval: {
            id: string;
            idempotencyKey: string | null;
            sourceRef: string | null;
            status: import(".prisma/client").$Enums.ApprovalStatus;
            createdAt: Date;
            consumedAt: Date | null;
            reason: string;
            evidence: import("@prisma/client/runtime/library").JsonValue | null;
            requester: string;
            approver: string | null;
            action: string;
        } | null;
        lines: ({
            returnItem: {
                id: string;
                createdAt: Date;
                returnId: string;
                qty: number;
                orderItemId: string;
                refundAmount: number;
            };
        } & {
            id: string;
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
            createdAt: Date;
            taxBaseAmount: number;
            qty: number;
            refundId: string;
            grossAmount: number;
            revenueAmount: number;
            returnItemId: string;
        })[];
        allocations: ({
            originalPayment: {
                id: string;
                idempotencyKey: string | null;
                point: string | null;
                accountCode: string | null;
                accountingEntryId: string | null;
                txnId: string | null;
                orderId: string | null;
                serviceWorkOrderId: string | null;
                originalPaymentId: string | null;
                giftCardId: string | null;
                amount: number;
                method: import(".prisma/client").$Enums.PaymentMethod;
                status: import(".prisma/client").$Enums.PaymentStatus;
                shiftId: string | null;
                receivedBy: string | null;
                createdAt: Date;
            };
            refundPayment: {
                id: string;
                idempotencyKey: string | null;
                point: string | null;
                accountCode: string | null;
                accountingEntryId: string | null;
                txnId: string | null;
                orderId: string | null;
                serviceWorkOrderId: string | null;
                originalPaymentId: string | null;
                giftCardId: string | null;
                amount: number;
                method: import(".prisma/client").$Enums.PaymentMethod;
                status: import(".prisma/client").$Enums.PaymentStatus;
                shiftId: string | null;
                receivedBy: string | null;
                createdAt: Date;
            } | null;
        } & {
            id: string;
            accountingEntryId: string | null;
            originalPaymentId: string;
            amount: number;
            status: import(".prisma/client").$Enums.RefundAllocationStatus;
            shiftId: string | null;
            createdAt: Date;
            updatedAt: Date;
            attempts: number;
            lastError: string | null;
            nextAttemptAt: Date | null;
            refundId: string;
            ordinal: number;
            methodSnapshot: import(".prisma/client").$Enums.PaymentMethod;
            providerRefundId: string | null;
            lockedAt: Date | null;
            refundPaymentId: string | null;
        })[];
    } & {
        id: string;
        idempotencyKey: string;
        orderId: string;
        amount: number;
        status: import(".prisma/client").$Enums.RefundStatus;
        createdAt: Date;
        updatedAt: Date;
        returnId: string | null;
        purpose: import(".prisma/client").$Enums.RefundPurpose;
        reason: string;
        approvalId: string | null;
        approvedAt: Date | null;
        completedAt: Date | null;
        requestHash: string;
        requester: string;
        approver: string | null;
    }) | null>;
    cancel(user: AuthPrincipal, id: string, idempotencyKey: string | undefined, dto: CancelRefundDto): Promise<({
        return: ({
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
        }) | null;
        approval: {
            id: string;
            idempotencyKey: string | null;
            sourceRef: string | null;
            status: import(".prisma/client").$Enums.ApprovalStatus;
            createdAt: Date;
            consumedAt: Date | null;
            reason: string;
            evidence: import("@prisma/client/runtime/library").JsonValue | null;
            requester: string;
            approver: string | null;
            action: string;
        } | null;
        lines: ({
            returnItem: {
                id: string;
                createdAt: Date;
                returnId: string;
                qty: number;
                orderItemId: string;
                refundAmount: number;
            };
        } & {
            id: string;
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
            createdAt: Date;
            taxBaseAmount: number;
            qty: number;
            refundId: string;
            grossAmount: number;
            revenueAmount: number;
            returnItemId: string;
        })[];
        allocations: ({
            originalPayment: {
                id: string;
                idempotencyKey: string | null;
                point: string | null;
                accountCode: string | null;
                accountingEntryId: string | null;
                txnId: string | null;
                orderId: string | null;
                serviceWorkOrderId: string | null;
                originalPaymentId: string | null;
                giftCardId: string | null;
                amount: number;
                method: import(".prisma/client").$Enums.PaymentMethod;
                status: import(".prisma/client").$Enums.PaymentStatus;
                shiftId: string | null;
                receivedBy: string | null;
                createdAt: Date;
            };
            refundPayment: {
                id: string;
                idempotencyKey: string | null;
                point: string | null;
                accountCode: string | null;
                accountingEntryId: string | null;
                txnId: string | null;
                orderId: string | null;
                serviceWorkOrderId: string | null;
                originalPaymentId: string | null;
                giftCardId: string | null;
                amount: number;
                method: import(".prisma/client").$Enums.PaymentMethod;
                status: import(".prisma/client").$Enums.PaymentStatus;
                shiftId: string | null;
                receivedBy: string | null;
                createdAt: Date;
            } | null;
        } & {
            id: string;
            accountingEntryId: string | null;
            originalPaymentId: string;
            amount: number;
            status: import(".prisma/client").$Enums.RefundAllocationStatus;
            shiftId: string | null;
            createdAt: Date;
            updatedAt: Date;
            attempts: number;
            lastError: string | null;
            nextAttemptAt: Date | null;
            refundId: string;
            ordinal: number;
            methodSnapshot: import(".prisma/client").$Enums.PaymentMethod;
            providerRefundId: string | null;
            lockedAt: Date | null;
            refundPaymentId: string | null;
        })[];
    } & {
        id: string;
        idempotencyKey: string;
        orderId: string;
        amount: number;
        status: import(".prisma/client").$Enums.RefundStatus;
        createdAt: Date;
        updatedAt: Date;
        returnId: string | null;
        purpose: import(".prisma/client").$Enums.RefundPurpose;
        reason: string;
        approvalId: string | null;
        approvedAt: Date | null;
        completedAt: Date | null;
        requestHash: string;
        requester: string;
        approver: string | null;
    }) | null>;
    resolve(user: AuthPrincipal, id: string, idempotencyKey: string | undefined, dto: ResolveRefundDto): Promise<({
        return: ({
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
        }) | null;
        approval: {
            id: string;
            idempotencyKey: string | null;
            sourceRef: string | null;
            status: import(".prisma/client").$Enums.ApprovalStatus;
            createdAt: Date;
            consumedAt: Date | null;
            reason: string;
            evidence: import("@prisma/client/runtime/library").JsonValue | null;
            requester: string;
            approver: string | null;
            action: string;
        } | null;
        lines: ({
            returnItem: {
                id: string;
                createdAt: Date;
                returnId: string;
                qty: number;
                orderItemId: string;
                refundAmount: number;
            };
        } & {
            id: string;
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
            createdAt: Date;
            taxBaseAmount: number;
            qty: number;
            refundId: string;
            grossAmount: number;
            revenueAmount: number;
            returnItemId: string;
        })[];
        allocations: ({
            originalPayment: {
                id: string;
                idempotencyKey: string | null;
                point: string | null;
                accountCode: string | null;
                accountingEntryId: string | null;
                txnId: string | null;
                orderId: string | null;
                serviceWorkOrderId: string | null;
                originalPaymentId: string | null;
                giftCardId: string | null;
                amount: number;
                method: import(".prisma/client").$Enums.PaymentMethod;
                status: import(".prisma/client").$Enums.PaymentStatus;
                shiftId: string | null;
                receivedBy: string | null;
                createdAt: Date;
            };
            refundPayment: {
                id: string;
                idempotencyKey: string | null;
                point: string | null;
                accountCode: string | null;
                accountingEntryId: string | null;
                txnId: string | null;
                orderId: string | null;
                serviceWorkOrderId: string | null;
                originalPaymentId: string | null;
                giftCardId: string | null;
                amount: number;
                method: import(".prisma/client").$Enums.PaymentMethod;
                status: import(".prisma/client").$Enums.PaymentStatus;
                shiftId: string | null;
                receivedBy: string | null;
                createdAt: Date;
            } | null;
        } & {
            id: string;
            accountingEntryId: string | null;
            originalPaymentId: string;
            amount: number;
            status: import(".prisma/client").$Enums.RefundAllocationStatus;
            shiftId: string | null;
            createdAt: Date;
            updatedAt: Date;
            attempts: number;
            lastError: string | null;
            nextAttemptAt: Date | null;
            refundId: string;
            ordinal: number;
            methodSnapshot: import(".prisma/client").$Enums.PaymentMethod;
            providerRefundId: string | null;
            lockedAt: Date | null;
            refundPaymentId: string | null;
        })[];
    } & {
        id: string;
        idempotencyKey: string;
        orderId: string;
        amount: number;
        status: import(".prisma/client").$Enums.RefundStatus;
        createdAt: Date;
        updatedAt: Date;
        returnId: string | null;
        purpose: import(".prisma/client").$Enums.RefundPurpose;
        reason: string;
        approvalId: string | null;
        approvedAt: Date | null;
        completedAt: Date | null;
        requestHash: string;
        requester: string;
        approver: string | null;
    }) | null>;
}
