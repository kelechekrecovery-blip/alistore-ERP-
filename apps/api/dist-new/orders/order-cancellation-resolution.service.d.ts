import { ConfigService } from '@nestjs/config';
import { OrderCancellationFaultParty, OrderCancellationResolutionAction, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { OutboxService } from '../outbox/outbox.service';
export interface ResolveOrderCancellationInput {
    action: OrderCancellationResolutionAction;
    refundAmount?: number;
    supplierExpenseAmount?: number;
    faultParty?: OrderCancellationFaultParty;
    ownerReason: string;
    evidenceIds?: string[];
}
export declare class OrderCancellationResolutionService {
    private readonly prisma;
    private readonly audit;
    private readonly staffAuth;
    private readonly config;
    private readonly outbox?;
    constructor(prisma: PrismaService, audit: AuditService, staffAuth: StaffAuthService, config: ConfigService, outbox?: OutboxService | undefined);
    preview(orderId: string, cancellationId: string, role: string): Promise<{
        canResolve: boolean;
        fullRefundAmount: number;
        partialRefundRules: {
            faultParty: string;
            evidenceRequired: boolean;
            formula: string;
        };
        order: {
            purchaseOrders: {
                id: string;
                status: import(".prisma/client").$Enums.PurchaseOrderStatus;
                sentAt: Date | null;
            }[];
        };
        id: string;
        orderId: string;
        status: import(".prisma/client").$Enums.OrderCancellationStatus;
        createdAt: Date;
        completedAt: Date | null;
        refundId: string | null;
        evidence: Prisma.JsonValue;
        policySnapshot: import(".prisma/client").$Enums.OrderCancellationPolicy;
        purchaseOrderSentSnapshot: boolean;
        depositPaidSnapshot: number;
        requestedRefundAmount: number;
        approvedRefundAmount: number | null;
        supplierExpenseAmount: number;
        faultParty: import(".prisma/client").$Enums.OrderCancellationFaultParty | null;
        customerReason: string;
        ownerReason: string | null;
        resolutionAction: import(".prisma/client").$Enums.OrderCancellationResolutionAction | null;
        resolvedBy: string | null;
        resolvedAt: Date | null;
    } | null>;
    resolve(orderId: string, cancellationId: string, actor: string, role: string, input: ResolveOrderCancellationInput, idempotencyKey: string, totpToken: string): Promise<{
        id: string;
        orderId: string;
        status: import(".prisma/client").$Enums.OrderCancellationStatus;
        createdAt: Date;
        completedAt: Date | null;
        refundId: string | null;
        evidence: Prisma.JsonValue;
        policySnapshot: import(".prisma/client").$Enums.OrderCancellationPolicy;
        purchaseOrderSentSnapshot: boolean;
        depositPaidSnapshot: number;
        requestedRefundAmount: number;
        approvedRefundAmount: number | null;
        supplierExpenseAmount: number;
        faultParty: import(".prisma/client").$Enums.OrderCancellationFaultParty | null;
        customerReason: string;
        ownerReason: string | null;
        resolutionAction: import(".prisma/client").$Enums.OrderCancellationResolutionAction | null;
        resolvedBy: string | null;
        resolvedAt: Date | null;
    }>;
    private enabled;
    private assertOwnerRole;
    private assertEvidenceOnTx;
    private refundAllocationsOnTx;
}
