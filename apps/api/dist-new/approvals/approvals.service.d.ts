import { Prisma } from '@prisma/client';
import { AuditInput, AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { Role } from '../rbac/permissions';
import { ExchangesService } from '../exchanges/exchanges.service';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
export interface ApprovalRequest {
    action: string;
    requester: string;
    reason: string;
    payload?: Record<string, unknown>;
    evidence?: Record<string, unknown>;
    idempotencyKey?: string;
    sourceRef?: string;
}
export declare const FOUR_EYES_ACTIONS: readonly string[];
export declare const SINGLE_APPROVER_ACTIONS: readonly string[];
export interface DecideInput {
    status: 'approved' | 'rejected';
    approver: string;
    approverRole: Role;
    reason?: string;
}
export declare class ApprovalsService {
    private readonly prisma;
    private readonly audit;
    private readonly exchanges?;
    private readonly staffAuth?;
    private readonly outbox?;
    constructor(prisma: PrismaService, audit: AuditService, exchanges?: ExchangesService | undefined, staffAuth?: StaffAuthService | undefined, outbox?: OutboxService | undefined);
    get(id: string): Prisma.Prisma__ApprovalClient<({
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
        evidence: Prisma.JsonValue | null;
        requester: string;
        approver: string | null;
        action: string;
    }) | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
    list(status?: string): Prisma.PrismaPromise<({
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
        evidence: Prisma.JsonValue | null;
        requester: string;
        approver: string | null;
        action: string;
    })[]>;
    request(req: ApprovalRequest): Promise<{
        approvalId: string;
        status: 'requested';
    }>;
    requestOnTx(tx: Prisma.TransactionClient, req: ApprovalRequest): Promise<{
        result: {
            approvalId: string;
            status: 'requested';
        };
        events: AuditInput[];
    }>;
    private replayApprovalOnTx;
    private createApprovalOnTx;
    decide(id: string, input: DecideInput): Promise<{
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
    } | null>;
    decideWithStepUp(id: string, input: DecideInput, totpToken?: string): Promise<{
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
    } | null>;
    private decideOnTx;
}
