import { Prisma } from '@prisma/client';
export type CashDrawerMovementKind = 'cod_handover' | 'giftcard_issue' | 'consignment_payout' | 'tradein_buyback' | 'loaner_deposit';
export interface CashDrawerMovementInput {
    idempotencyKey: string;
    staffId: string;
    amount: number;
    kind: CashDrawerMovementKind;
    sourceType?: string;
    sourceRef?: string;
    reason?: string | null;
    createdBy: string;
    accountingEntryId?: string | null;
}
export declare function resolveOpenCashShiftOnTx(tx: Prisma.TransactionClient, staffId: string): Promise<{
    id: string;
    point: string;
    closedAt: Date | null;
    staffId: string;
    openCash: number;
    closeCash: number | null;
    closeReason: string | null;
    openIdempotencyKey: string | null;
    closeIdempotencyKey: string | null;
    diff: number | null;
    openedAt: Date;
}>;
export declare function recordCashDrawerMovementOnTx(tx: Prisma.TransactionClient, input: CashDrawerMovementInput): Promise<{
    id: string;
    idempotencyKey: string;
    sourceType: string | null;
    sourceRef: string | null;
    point: string;
    createdBy: string;
    accountingEntryId: string | null;
    amount: number;
    shiftId: string;
    createdAt: Date;
    kind: string;
    reason: string | null;
}>;
