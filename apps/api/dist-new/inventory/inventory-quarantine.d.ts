import { Prisma } from '@prisma/client';
export declare function createQuarantineCaseOnTx(tx: Prisma.TransactionClient, input: {
    unitId: string;
    sourceType: 'return' | 'exchange';
    returnId: string;
    reason: string;
    unitCost: number;
    actor: string;
}): Prisma.Prisma__InventoryQuarantineCaseClient<{
    id: string;
    sourceType: string;
    createdBy: string;
    status: import(".prisma/client").$Enums.InventoryQuarantineStatus;
    createdAt: Date;
    updatedAt: Date;
    unitCost: number;
    returnId: string;
    unitId: string;
    reason: string;
    dispositionApprovalId: string | null;
    repairWorkOrderId: string | null;
    diagnosis: import(".prisma/client").$Enums.InventoryQuarantineDiagnosis | null;
    disposition: import(".prisma/client").$Enums.InventoryQuarantineDisposition | null;
    notes: string | null;
    diagnosedBy: string | null;
    disposedBy: string | null;
    diagnosedAt: Date | null;
    disposedAt: Date | null;
}, never, import("@prisma/client/runtime/library").DefaultArgs>;
