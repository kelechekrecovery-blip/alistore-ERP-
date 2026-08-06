export declare class PurchaseOrderLineDto {
    productId: string;
    qty: number;
    unitCost: number;
}
export declare class CreatePurchaseOrderDto {
    idempotencyKey: string;
    supplierId: string;
    location: string;
    note?: string;
    items: PurchaseOrderLineDto[];
}
export declare class ReceivePurchaseOrderLineDto {
    itemId: string;
    imeis?: string[];
    qty?: number;
    grade?: 'A' | 'B' | 'C';
}
export declare class ReceivePurchaseOrderDto {
    idempotencyKey: string;
    lines: ReceivePurchaseOrderLineDto[];
}
export declare class CreateSupplierInvoiceDto {
    idempotencyKey: string;
    invoiceNumber: string;
    supplierId: string;
    purchaseOrderId: string;
    amount: number;
    dueDate?: string;
}
export declare class PaySupplierInvoiceDto {
    paymentKey: string;
    paymentAccountCode: '1000' | '1010' | '1020';
    paymentReference: string;
}
export declare class CreateSupplierInvoicePaymentDto {
    idempotencyKey: string;
    paymentKey: string;
    amount: number;
    paymentAccountCode: '1000' | '1010' | '1020';
    paymentReference: string;
}
export declare class CreateSupplierAdvanceDto {
    idempotencyKey: string;
    paymentKey: string;
    supplierId: string;
    amount: number;
    paymentAccountCode: '1000' | '1010' | '1020';
    paymentReference: string;
}
export declare class ApplySupplierAdvanceDto {
    idempotencyKey: string;
    invoiceId: string;
    amount: number;
}
export declare class SupplierStatementLineDto {
    externalId: string;
    occurredAt: string;
    amount: number;
    reference?: string;
}
export declare class ImportSupplierStatementDto {
    idempotencyKey: string;
    statementNumber: string;
    supplierId: string;
    periodStart: string;
    periodEnd: string;
    openingBalance: number;
    closingBalance: number;
    lines: SupplierStatementLineDto[];
}
export declare class ReconcileSupplierStatementLineDto {
    idempotencyKey: string;
    journalEntryId: string;
}
export declare class CreateLandedCostDto {
    idempotencyKey: string;
    documentNumber: string;
    purchaseOrderId: string;
    amount: number;
    creditAccountCode: '2000' | '1010' | '1020' | '6600';
    description: string;
}
export declare class CreateSupplierCreditNoteDto {
    idempotencyKey: string;
    noteNumber: string;
    supplierId: string;
    invoiceId: string;
    amount: number;
    reason: string;
}
