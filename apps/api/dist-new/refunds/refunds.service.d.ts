import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { CancelRefundDto, CreateRefundDto } from './refunds.dto';
export declare class RefundsService {
    private readonly prisma;
    private readonly audit;
    private readonly outbox?;
    constructor(prisma: PrismaService, audit: AuditService, outbox?: OutboxService | undefined);
    get(id: string): Prisma.Prisma__RefundClient<({
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
            evidence: Prisma.JsonValue | null;
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
    request(returnId: string, dto: CreateRefundDto, actor: string, idempotencyKey: string): Promise<({
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
            evidence: Prisma.JsonValue | null;
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
    cancel(id: string, dto: CancelRefundDto, actor: string, idempotencyKey: string): Promise<({
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
            evidence: Prisma.JsonValue | null;
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
    private allocateOnTx;
    private assertCashShift;
}
