import { Prisma } from '@prisma/client';
export declare const INVENTORY_ASSET_ACCOUNT = "1200";
export declare const COGS_ACCOUNT = "5000";
export declare const INVENTORY_VARIANCE_ACCOUNT = "6900";
export declare function adjustQuantityValuationOnTx(tx: Prisma.TransactionClient, input: {
    movementId: string;
    productId: string;
    balanceId: string;
    location: string;
    quantityDelta: number;
    unitCost?: number;
    actor: string;
    sourceType: 'inventory.write_off' | 'inventory.adjustment' | 'service.consumed';
    debitAccount?: string;
}): Promise<{
    totalValue: number;
    unitCost: number | null;
    entry: {
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
    } | null;
    complete: boolean;
}>;
export declare function transferQuantityValuationOnTx(tx: Prisma.TransactionClient, input: {
    movementId: string;
    productId: string;
    sourceBalanceId: string;
    destinationBalanceId: string;
    destination: string;
    quantity: number;
}): Promise<{
    totalValue: number;
    unitCost: number | null;
}>;
export declare function postCogsOnTx(tx: Prisma.TransactionClient, input: {
    productId: string;
    orderId: string;
    sourceRef: string;
    imei?: string;
    layerId?: string;
    location: string;
    quantity: number;
    unitCost: number;
    actor: string;
    occurredAt?: Date;
}): Promise<{
    issue: {
        id: string;
        sourceType: string;
        sourceRef: string;
        orderId: string | null;
        createdAt: Date;
        location: string;
        unitCost: number;
        productId: string;
        quantity: number;
        reversedQty: number;
        totalCost: number;
        layerId: string | null;
        imei: string | null;
    };
    entry: {
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
    } | null;
}>;
export declare function consumeQuantityValuationOnTx(tx: Prisma.TransactionClient, input: {
    orderId: string;
    allocationId: string;
    productId: string;
    balanceId: string;
    quantity: number;
    actor: string;
}): Promise<number>;
export declare function reverseInventoryCostOnTx(tx: Prisma.TransactionClient, input: {
    issueId: string;
    quantity: number;
    returnId: string;
    location: string;
    actor: string;
    occurredAt?: Date;
}): Promise<{
    issue: {
        id: string;
        sourceType: string;
        sourceRef: string;
        orderId: string | null;
        createdAt: Date;
        location: string;
        unitCost: number;
        productId: string;
        quantity: number;
        reversedQty: number;
        totalCost: number;
        layerId: string | null;
        imei: string | null;
    };
    reversal: {
        id: string;
        sourceType: string;
        sourceRef: string;
        createdAt: Date;
        location: string;
        unitCost: number;
        productId: string;
        quantity: number;
        totalCost: number;
        issueId: string;
        returnId: string;
    };
    quantity: number;
    unitCost: number;
    totalCost: number;
    entry: {
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
    } | null;
}>;
export declare function reverseQuantityCostOnTx(tx: Prisma.TransactionClient, input: {
    orderId: string;
    allocationId: string;
    productId: string;
    balanceId: string;
    quantity: number;
    returnId: string;
    actor: string;
}): Promise<{
    quantity: number;
    totalCost: number;
    entries: {
        id: string;
        issueId: string;
        quantity: number;
        totalCost: number;
    }[];
}>;
