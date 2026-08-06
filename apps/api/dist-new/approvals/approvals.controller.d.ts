import { ApprovalsService } from './approvals.service';
import { DecideApprovalDto } from './approvals.dto';
import { AuthPrincipal } from '../auth/jwt.strategy';
export declare class ApprovalsController {
    private readonly approvals;
    constructor(approvals: ApprovalsService);
    list(user: AuthPrincipal, status?: string): import(".prisma/client").Prisma.PrismaPromise<({
        exchangeRequest: {
            id: string;
            idempotencyKey: string;
            method: import(".prisma/client").$Enums.PaymentMethod;
            status: string;
            shiftId: string | null;
            createdAt: Date;
            updatedAt: Date;
            returnId: string | null;
            expiresAt: Date;
            approvalId: string;
            exchangeOrderId: string | null;
            requester: string;
            externalReference: string | null;
            originalOrderId: string;
            oldImei: string;
            newProductId: string;
            newUnitId: string;
            newImei: string;
            creditAmount: number;
            surchargeAmount: number;
            executedAt: Date | null;
            rejectedAt: Date | null;
            expiredAt: Date | null;
        } | null;
    } & {
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
    })[]>;
    get(user: AuthPrincipal, id: string): Promise<{
        exchangeRequest: {
            id: string;
            idempotencyKey: string;
            method: import(".prisma/client").$Enums.PaymentMethod;
            status: string;
            shiftId: string | null;
            createdAt: Date;
            updatedAt: Date;
            returnId: string | null;
            expiresAt: Date;
            approvalId: string;
            exchangeOrderId: string | null;
            requester: string;
            externalReference: string | null;
            originalOrderId: string;
            oldImei: string;
            newProductId: string;
            newUnitId: string;
            newImei: string;
            creditAmount: number;
            surchargeAmount: number;
            executedAt: Date | null;
            rejectedAt: Date | null;
            expiredAt: Date | null;
        } | null;
    } & {
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
    }>;
    decide(user: AuthPrincipal, id: string, dto: DecideApprovalDto): Promise<{
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
    } | null>;
    private assertStaff;
}
