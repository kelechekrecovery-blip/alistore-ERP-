import { ExpenseTaxMode } from '@prisma/client';
export type ExpenseAccountingSnapshotInput = {
    documentAmount: number;
    exchangeRateMicros: number;
    taxMode: ExpenseTaxMode;
    taxRateBps: number;
};
export declare function expenseAccountingSnapshot(input: ExpenseAccountingSnapshotInput): {
    amount: number;
    taxBaseAmount: number;
    taxAmount: number;
};
