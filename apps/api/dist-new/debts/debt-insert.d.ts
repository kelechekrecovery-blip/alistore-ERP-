import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
export interface DebtInput {
    orderId: string;
    customerId: string;
    principal: number;
    installments: number;
    dueDate: Date;
    idempotencyKey?: string | null;
}
export declare function insertDebt(tx: Prisma.TransactionClient, input: DebtInput, actor: string, events: AuditInput[]): Promise<{
    id: string;
    idempotencyKey: string | null;
    accountingEntryId: string | null;
    orderId: string;
    status: import(".prisma/client").$Enums.DebtStatus;
    createdAt: Date;
    balance: number;
    customerId: string;
    principal: number;
    installments: number;
    dueDate: Date;
}>;
