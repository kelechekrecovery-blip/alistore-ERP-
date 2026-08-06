import { AccountingAccountType, PaymentMethod, Prisma } from '@prisma/client';
export declare const FUNDING_ACCOUNT_CODES: readonly ["1000", "1010", "1020"];
export type AccountingJournalLineInput = {
    accountCode: string;
    debit?: number;
    credit?: number;
    memo?: string | null;
};
export type AccountingJournalEntryInput = {
    idempotencyKey: string;
    sourceType: string;
    sourceRef: string;
    description: string;
    point?: string | null;
    currency?: string;
    documentAmount?: number | null;
    exchangeRateMicros?: number;
    baseAmount?: number | null;
    taxCode?: string;
    taxRateBps?: number;
    taxAmount?: number;
    occurredAt: Date;
    createdBy: string;
    lines: AccountingJournalLineInput[];
};
export declare function expenseAccountCode(category: string): string;
export declare function paymentAccountCode(method: PaymentMethod): "1000" | "1020" | "2300";
export declare function postPaymentEntryOnTx(tx: Prisma.TransactionClient, input: {
    payment: {
        id: string;
        amount: number;
        method: PaymentMethod;
        orderId: string | null;
        serviceWorkOrderId: string | null;
        createdAt: Date;
    };
    idempotencyKey: string;
    point?: string | null;
    actor: string;
    receivedBy?: string | null;
    tax?: {
        taxCode: string;
        taxRateBps: number;
        taxAmount: number;
    };
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
}>;
export declare function postCustomerPrepaymentRefundOnTx(tx: Prisma.TransactionClient, input: {
    payment: {
        id: string;
        amount: number;
        method: PaymentMethod;
        createdAt: Date;
    };
    idempotencyKey: string;
    point?: string | null;
    actor: string;
    receivedBy?: string | null;
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
}>;
export declare function postOrderReceivableOnTx(tx: Prisma.TransactionClient, input: {
    idempotencyKey: string;
    sourceType: string;
    sourceRef: string;
    description: string;
    order: {
        id: string;
        total: number;
        taxAmount: number;
        storePointCode?: string | null;
        items: Array<{
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
        }>;
    };
    processedBefore: number;
    amount: number;
    occurredAt: Date;
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
}>;
export declare function postAccountingEntryOnTx(tx: Prisma.TransactionClient, input: AccountingJournalEntryInput): Promise<{
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
}>;
export declare function accountingPeriodKey(date: Date): string;
export declare function normalBalance(type: AccountingAccountType, debit: number, credit: number): number;
