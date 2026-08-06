import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
export declare function postConsignmentReturnAccountingOnTx(tx: Prisma.TransactionClient, input: {
    returnId: string;
    sourceRef: string;
    ownerAmount: number;
    payoutPaid: boolean;
    actor: string;
}): Promise<{
    idempotent: boolean;
    id: string;
    idempotencyKey: string;
    sourceType: string;
    sourceRef: string;
    description: string;
    point: string | null;
    currency: string;
    documentAmount: number | null;
    exchangeRateMicros: number;
    baseAmount: number | null;
    taxCode: string;
    taxRateBps: number;
    taxAmount: number;
    occurredAt: Date;
    postedAt: Date;
    createdBy: string;
    reversalOfId: string | null;
    lines: Array<{
        accountCode: string;
        debit: number;
        credit: number;
        memo: string | null;
    }>;
} | null>;
export declare function accrueConsignmentSalesOnTx(tx: Prisma.TransactionClient, input: {
    orderId: string;
    imeis: string[];
    actor: string;
    events: AuditInput[];
}): Promise<void>;
export declare function reserveQuantityConsignmentOnTx(tx: Prisma.TransactionClient, input: {
    orderQuantityAllocationId: string;
    balanceId: string;
    qty: number;
}): Promise<void>;
export declare function releaseQuantityConsignmentOnTx(tx: Prisma.TransactionClient, orderQuantityAllocationId: string): Promise<void>;
export declare function accrueQuantityConsignmentSalesOnTx(tx: Prisma.TransactionClient, input: {
    orderId: string;
    orderQuantityAllocationIds: string[];
    actor: string;
    events: AuditInput[];
}): Promise<void>;
export declare function transferQuantityConsignmentOnTx(tx: Prisma.TransactionClient, input: {
    movementId: string;
    sourceBalanceId: string;
    destinationBalanceId: string;
    destination: string;
    qty: number;
    actor: string;
}): Promise<number>;
