import { Prisma } from '@prisma/client';
type Amount = {
    quantity: number;
    value: number;
};
type Row = {
    productId: string;
    sku: string;
    name: string;
    location: string;
    opening: Amount;
    receipts: Amount;
    returns: Amount;
    transferIn: Amount;
    transferOut: Amount;
    issues: Amount;
    adjustmentsIn: Amount;
    adjustmentsOut: Amount;
    closing: Amount;
};
export declare function inventoryValuationRollForward(prisma: Prisma.TransactionClient, fromInput: string, toInput: string): Promise<{
    generatedAt: string;
    period: {
        from: string;
        to: string;
        semantics: "[from,to)";
    };
    scope: "owned_inventory";
    summary: {
        openingValue: number;
        closingValue: number;
        glOpening: number;
        glMovement: number;
        glClosing: number;
        openingDifference: number;
        closingDifference: number;
        missingReversalQuantity: number;
        incompleteTransfers: number;
        incompleteSerializedReceipts: number;
        incompleteServiceConsumptions: number;
        unknownIssueLocations: number;
        unknownReversalLocations: number;
        legacyConsignmentIssues: number;
        incompleteQuantityBalances: number;
        complete: boolean;
        consistent: boolean;
    };
    rows: Row[];
}>;
export {};
