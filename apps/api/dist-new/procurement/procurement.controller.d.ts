import { AuthPrincipal } from '../auth/jwt.strategy';
import { ApplySupplierAdvanceDto, CreateLandedCostDto, CreatePurchaseOrderDto, CreateSupplierAdvanceDto, CreateSupplierCreditNoteDto, CreateSupplierInvoiceDto, CreateSupplierInvoicePaymentDto, ImportSupplierStatementDto, PaySupplierInvoiceDto, ReceivePurchaseOrderDto, ReconcileSupplierStatementLineDto } from './procurement.dto';
import { ProcurementService } from './procurement.service';
export declare class ProcurementController {
    private readonly procurement;
    constructor(procurement: ProcurementService);
    list(status?: string): import(".prisma/client").Prisma.PrismaPromise<({
        supplier: {
            id: string;
            name: string;
            contact: string | null;
        };
        items: ({
            product: {
                id: string;
                name: string;
                sku: string;
            };
        } & {
            id: string;
            unitCost: number;
            productId: string;
            receivedQty: number;
            orderedQty: number;
            purchaseOrderId: string;
        })[];
        receipts: {
            id: string;
            actor: string;
            idempotencyKey: string;
            accountingEntryId: string | null;
            createdAt: Date;
        }[];
    } & {
        number: string;
        id: string;
        idempotencyKey: string | null;
        createdBy: string;
        status: import(".prisma/client").$Enums.PurchaseOrderStatus;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        supplierId: string;
        sentAt: Date | null;
        note: string | null;
        sourceOrderId: string | null;
        sourceKey: string | null;
        sourceVersion: number;
        receivedAt: Date | null;
    })[]>;
    get(id: string): Promise<{
        supplier: {
            id: string;
            name: string;
            contact: string | null;
        };
        items: ({
            product: {
                id: string;
                name: string;
                sku: string;
            };
        } & {
            id: string;
            unitCost: number;
            productId: string;
            receivedQty: number;
            orderedQty: number;
            purchaseOrderId: string;
        })[];
        receipts: {
            id: string;
            actor: string;
            idempotencyKey: string;
            accountingEntryId: string | null;
            createdAt: Date;
        }[];
    } & {
        number: string;
        id: string;
        idempotencyKey: string | null;
        createdBy: string;
        status: import(".prisma/client").$Enums.PurchaseOrderStatus;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        supplierId: string;
        sentAt: Date | null;
        note: string | null;
        sourceOrderId: string | null;
        sourceKey: string | null;
        sourceVersion: number;
        receivedAt: Date | null;
    }>;
    create(user: AuthPrincipal, dto: CreatePurchaseOrderDto): Promise<{
        supplier: {
            id: string;
            name: string;
            contact: string | null;
        };
        items: ({
            product: {
                id: string;
                name: string;
                sku: string;
            };
        } & {
            id: string;
            unitCost: number;
            productId: string;
            receivedQty: number;
            orderedQty: number;
            purchaseOrderId: string;
        })[];
        receipts: {
            id: string;
            actor: string;
            idempotencyKey: string;
            accountingEntryId: string | null;
            createdAt: Date;
        }[];
    } & {
        number: string;
        id: string;
        idempotencyKey: string | null;
        createdBy: string;
        status: import(".prisma/client").$Enums.PurchaseOrderStatus;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        supplierId: string;
        sentAt: Date | null;
        note: string | null;
        sourceOrderId: string | null;
        sourceKey: string | null;
        sourceVersion: number;
        receivedAt: Date | null;
    }>;
    send(user: AuthPrincipal, id: string): Promise<{
        supplier: {
            id: string;
            name: string;
            contact: string | null;
        };
        items: ({
            product: {
                id: string;
                name: string;
                sku: string;
            };
        } & {
            id: string;
            unitCost: number;
            productId: string;
            receivedQty: number;
            orderedQty: number;
            purchaseOrderId: string;
        })[];
        receipts: {
            id: string;
            actor: string;
            idempotencyKey: string;
            accountingEntryId: string | null;
            createdAt: Date;
        }[];
    } & {
        number: string;
        id: string;
        idempotencyKey: string | null;
        createdBy: string;
        status: import(".prisma/client").$Enums.PurchaseOrderStatus;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        supplierId: string;
        sentAt: Date | null;
        note: string | null;
        sourceOrderId: string | null;
        sourceKey: string | null;
        sourceVersion: number;
        receivedAt: Date | null;
    }>;
    cancel(user: AuthPrincipal, id: string): Promise<{
        supplier: {
            id: string;
            name: string;
            contact: string | null;
        };
        items: ({
            product: {
                id: string;
                name: string;
                sku: string;
            };
        } & {
            id: string;
            unitCost: number;
            productId: string;
            receivedQty: number;
            orderedQty: number;
            purchaseOrderId: string;
        })[];
        receipts: {
            id: string;
            actor: string;
            idempotencyKey: string;
            accountingEntryId: string | null;
            createdAt: Date;
        }[];
    } & {
        number: string;
        id: string;
        idempotencyKey: string | null;
        createdBy: string;
        status: import(".prisma/client").$Enums.PurchaseOrderStatus;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        supplierId: string;
        sentAt: Date | null;
        note: string | null;
        sourceOrderId: string | null;
        sourceKey: string | null;
        sourceVersion: number;
        receivedAt: Date | null;
    }>;
    receive(user: AuthPrincipal, id: string, dto: ReceivePurchaseOrderDto): Promise<{
        idempotent: boolean;
        receiptId: string;
        supplier: {
            id: string;
            name: string;
            contact: string | null;
        };
        items: ({
            product: {
                id: string;
                name: string;
                sku: string;
            };
        } & {
            id: string;
            unitCost: number;
            productId: string;
            receivedQty: number;
            orderedQty: number;
            purchaseOrderId: string;
        })[];
        receipts: {
            id: string;
            actor: string;
            idempotencyKey: string;
            accountingEntryId: string | null;
            createdAt: Date;
        }[];
        number: string;
        id: string;
        idempotencyKey: string | null;
        createdBy: string;
        status: import(".prisma/client").$Enums.PurchaseOrderStatus;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        supplierId: string;
        sentAt: Date | null;
        note: string | null;
        sourceOrderId: string | null;
        sourceKey: string | null;
        sourceVersion: number;
        receivedAt: Date | null;
    }>;
}
export declare class SupplierInvoiceController {
    private readonly procurement;
    constructor(procurement: ProcurementService);
    list(status?: string): import(".prisma/client").Prisma.PrismaPromise<({
        supplier: {
            id: string;
            name: string;
            createdAt: Date;
            contact: string | null;
        };
        purchaseOrder: {
            number: string;
            id: string;
            status: import(".prisma/client").$Enums.PurchaseOrderStatus;
        };
        accountingEntry: ({
            lines: {
                id: string;
                credit: number;
                debit: number;
                entryId: string;
                accountCode: string;
                memo: string | null;
            }[];
        } & {
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
        }) | null;
        payments: {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            createdAt: Date;
            paymentKey: string;
            paidBy: string;
            paidAt: Date;
            paymentAccountCode: string;
            paymentReference: string;
            invoiceId: string;
        }[];
        advanceAllocations: ({
            advance: {
                id: string;
                paymentReference: string;
            };
        } & {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            invoiceId: string;
            appliedAt: Date;
            appliedBy: string;
            advanceId: string;
        })[];
    } & {
        id: string;
        idempotencyKey: string;
        createdBy: string;
        accountingEntryId: string | null;
        amount: number;
        status: import(".prisma/client").$Enums.SupplierInvoiceStatus;
        createdAt: Date;
        updatedAt: Date;
        supplierId: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        dueDate: Date | null;
        purchaseOrderId: string;
        paymentKey: string | null;
        paidBy: string | null;
        paidAt: Date | null;
        invoiceNumber: string;
        paymentAccountCode: string | null;
        paymentReference: string | null;
        matchedReceiptValue: number;
    })[]>;
    create(user: AuthPrincipal, dto: CreateSupplierInvoiceDto): Promise<{
        idempotent: boolean;
        id: string;
        idempotencyKey: string;
        createdBy: string;
        accountingEntryId: string | null;
        amount: number;
        status: import(".prisma/client").$Enums.SupplierInvoiceStatus;
        createdAt: Date;
        updatedAt: Date;
        supplierId: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        dueDate: Date | null;
        purchaseOrderId: string;
        paymentKey: string | null;
        paidBy: string | null;
        paidAt: Date | null;
        invoiceNumber: string;
        paymentAccountCode: string | null;
        paymentReference: string | null;
        matchedReceiptValue: number;
    } | ({
        supplier: {
            id: string;
            name: string;
            createdAt: Date;
            contact: string | null;
        };
        purchaseOrder: {
            number: string;
            id: string;
            status: import(".prisma/client").$Enums.PurchaseOrderStatus;
        };
    } & {
        id: string;
        idempotencyKey: string;
        createdBy: string;
        accountingEntryId: string | null;
        amount: number;
        status: import(".prisma/client").$Enums.SupplierInvoiceStatus;
        createdAt: Date;
        updatedAt: Date;
        supplierId: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        dueDate: Date | null;
        purchaseOrderId: string;
        paymentKey: string | null;
        paidBy: string | null;
        paidAt: Date | null;
        invoiceNumber: string;
        paymentAccountCode: string | null;
        paymentReference: string | null;
        matchedReceiptValue: number;
    })>;
    approve(user: AuthPrincipal, id: string): Promise<{
        id: string;
        idempotencyKey: string;
        createdBy: string;
        accountingEntryId: string | null;
        amount: number;
        status: import(".prisma/client").$Enums.SupplierInvoiceStatus;
        createdAt: Date;
        updatedAt: Date;
        supplierId: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        dueDate: Date | null;
        purchaseOrderId: string;
        paymentKey: string | null;
        paidBy: string | null;
        paidAt: Date | null;
        invoiceNumber: string;
        paymentAccountCode: string | null;
        paymentReference: string | null;
        matchedReceiptValue: number;
    }>;
    pay(user: AuthPrincipal, id: string, dto: PaySupplierInvoiceDto): Promise<{
        idempotent: boolean;
        id: string;
        idempotencyKey: string;
        createdBy: string;
        accountingEntryId: string | null;
        amount: number;
        status: import(".prisma/client").$Enums.SupplierInvoiceStatus;
        createdAt: Date;
        updatedAt: Date;
        supplierId: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        dueDate: Date | null;
        purchaseOrderId: string;
        paymentKey: string | null;
        paidBy: string | null;
        paidAt: Date | null;
        invoiceNumber: string;
        paymentAccountCode: string | null;
        paymentReference: string | null;
        matchedReceiptValue: number;
    }>;
    createPayment(user: AuthPrincipal, id: string, dto: CreateSupplierInvoicePaymentDto): Promise<{
        idempotent: boolean;
        id: string;
        idempotencyKey: string;
        createdBy: string;
        accountingEntryId: string | null;
        amount: number;
        status: import(".prisma/client").$Enums.SupplierInvoiceStatus;
        createdAt: Date;
        updatedAt: Date;
        supplierId: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        dueDate: Date | null;
        purchaseOrderId: string;
        paymentKey: string | null;
        paidBy: string | null;
        paidAt: Date | null;
        invoiceNumber: string;
        paymentAccountCode: string | null;
        paymentReference: string | null;
        matchedReceiptValue: number;
    }>;
}
export declare class SupplierCreditNoteController {
    private readonly procurement;
    constructor(procurement: ProcurementService);
    list(supplierId?: string): import(".prisma/client").Prisma.PrismaPromise<({
        supplier: {
            id: string;
            name: string;
        };
        accountingEntry: ({
            lines: {
                id: string;
                credit: number;
                debit: number;
                entryId: string;
                accountCode: string;
                memo: string | null;
            }[];
        } & {
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
        }) | null;
        invoice: {
            id: string;
            status: import(".prisma/client").$Enums.SupplierInvoiceStatus;
            invoiceNumber: string;
        };
    } & {
        id: string;
        idempotencyKey: string;
        createdBy: string;
        accountingEntryId: string | null;
        amount: number;
        status: import(".prisma/client").$Enums.SupplierCreditNoteStatus;
        createdAt: Date;
        updatedAt: Date;
        supplierId: string;
        reason: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        invoiceId: string;
        noteNumber: string;
        appliedAt: Date | null;
        appliedBy: string | null;
    })[]>;
    create(user: AuthPrincipal, dto: CreateSupplierCreditNoteDto): Promise<{
        idempotent: boolean;
        id: string;
        idempotencyKey: string;
        createdBy: string;
        accountingEntryId: string | null;
        amount: number;
        status: import(".prisma/client").$Enums.SupplierCreditNoteStatus;
        createdAt: Date;
        updatedAt: Date;
        supplierId: string;
        reason: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        invoiceId: string;
        noteNumber: string;
        appliedAt: Date | null;
        appliedBy: string | null;
    } | ({
        supplier: {
            id: string;
            name: string;
        };
        invoice: {
            id: string;
            status: import(".prisma/client").$Enums.SupplierInvoiceStatus;
            invoiceNumber: string;
        };
    } & {
        id: string;
        idempotencyKey: string;
        createdBy: string;
        accountingEntryId: string | null;
        amount: number;
        status: import(".prisma/client").$Enums.SupplierCreditNoteStatus;
        createdAt: Date;
        updatedAt: Date;
        supplierId: string;
        reason: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        invoiceId: string;
        noteNumber: string;
        appliedAt: Date | null;
        appliedBy: string | null;
    })>;
    approve(user: AuthPrincipal, id: string): Promise<{
        id: string;
        idempotencyKey: string;
        createdBy: string;
        accountingEntryId: string | null;
        amount: number;
        status: import(".prisma/client").$Enums.SupplierCreditNoteStatus;
        createdAt: Date;
        updatedAt: Date;
        supplierId: string;
        reason: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        invoiceId: string;
        noteNumber: string;
        appliedAt: Date | null;
        appliedBy: string | null;
    }>;
    apply(user: AuthPrincipal, id: string): Promise<{
        invoice: {
            id: string;
            idempotencyKey: string;
            createdBy: string;
            accountingEntryId: string | null;
            amount: number;
            status: import(".prisma/client").$Enums.SupplierInvoiceStatus;
            createdAt: Date;
            updatedAt: Date;
            supplierId: string;
            approvedBy: string | null;
            approvedAt: Date | null;
            dueDate: Date | null;
            purchaseOrderId: string;
            paymentKey: string | null;
            paidBy: string | null;
            paidAt: Date | null;
            invoiceNumber: string;
            paymentAccountCode: string | null;
            paymentReference: string | null;
            matchedReceiptValue: number;
        };
    } & {
        id: string;
        idempotencyKey: string;
        createdBy: string;
        accountingEntryId: string | null;
        amount: number;
        status: import(".prisma/client").$Enums.SupplierCreditNoteStatus;
        createdAt: Date;
        updatedAt: Date;
        supplierId: string;
        reason: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        invoiceId: string;
        noteNumber: string;
        appliedAt: Date | null;
        appliedBy: string | null;
    }>;
}
export declare class SupplierAdvanceController {
    private readonly procurement;
    constructor(procurement: ProcurementService);
    list(supplierId?: string): import(".prisma/client").Prisma.PrismaPromise<({
        supplier: {
            id: string;
            name: string;
        };
        accountingEntry: {
            lines: {
                id: string;
                credit: number;
                debit: number;
                entryId: string;
                accountCode: string;
                memo: string | null;
            }[];
        } & {
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
        };
        allocations: ({
            invoice: {
                id: string;
                status: import(".prisma/client").$Enums.SupplierInvoiceStatus;
                invoiceNumber: string;
            };
        } & {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            invoiceId: string;
            appliedAt: Date;
            appliedBy: string;
            advanceId: string;
        })[];
    } & {
        id: string;
        idempotencyKey: string;
        accountingEntryId: string;
        amount: number;
        status: import(".prisma/client").$Enums.SupplierAdvanceStatus;
        createdAt: Date;
        updatedAt: Date;
        supplierId: string;
        paymentKey: string;
        paidBy: string;
        paidAt: Date;
        paymentAccountCode: string;
        paymentReference: string;
        appliedAmount: number;
    })[]>;
    create(user: AuthPrincipal, dto: CreateSupplierAdvanceDto): Promise<{
        idempotent: boolean;
        id: string;
        idempotencyKey: string;
        accountingEntryId: string;
        amount: number;
        status: import(".prisma/client").$Enums.SupplierAdvanceStatus;
        createdAt: Date;
        updatedAt: Date;
        supplierId: string;
        paymentKey: string;
        paidBy: string;
        paidAt: Date;
        paymentAccountCode: string;
        paymentReference: string;
        appliedAmount: number;
    }>;
    apply(user: AuthPrincipal, id: string, dto: ApplySupplierAdvanceDto): Promise<{
        advance: {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            status: import(".prisma/client").$Enums.SupplierAdvanceStatus;
            createdAt: Date;
            updatedAt: Date;
            supplierId: string;
            paymentKey: string;
            paidBy: string;
            paidAt: Date;
            paymentAccountCode: string;
            paymentReference: string;
            appliedAmount: number;
        };
        allocation: {
            accountingEntry: {
                lines: {
                    id: string;
                    credit: number;
                    debit: number;
                    entryId: string;
                    accountCode: string;
                    memo: string | null;
                }[];
            } & {
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
            };
            invoice: {
                id: string;
                idempotencyKey: string;
                createdBy: string;
                accountingEntryId: string | null;
                amount: number;
                status: import(".prisma/client").$Enums.SupplierInvoiceStatus;
                createdAt: Date;
                updatedAt: Date;
                supplierId: string;
                approvedBy: string | null;
                approvedAt: Date | null;
                dueDate: Date | null;
                purchaseOrderId: string;
                paymentKey: string | null;
                paidBy: string | null;
                paidAt: Date | null;
                invoiceNumber: string;
                paymentAccountCode: string | null;
                paymentReference: string | null;
                matchedReceiptValue: number;
            };
            advance: {
                id: string;
                idempotencyKey: string;
                accountingEntryId: string;
                amount: number;
                status: import(".prisma/client").$Enums.SupplierAdvanceStatus;
                createdAt: Date;
                updatedAt: Date;
                supplierId: string;
                paymentKey: string;
                paidBy: string;
                paidAt: Date;
                paymentAccountCode: string;
                paymentReference: string;
                appliedAmount: number;
            };
        } & {
            id: string;
            idempotencyKey: string;
            accountingEntryId: string;
            amount: number;
            invoiceId: string;
            appliedAt: Date;
            appliedBy: string;
            advanceId: string;
        };
        invoice: {
            id: string;
            idempotencyKey: string;
            createdBy: string;
            accountingEntryId: string | null;
            amount: number;
            status: import(".prisma/client").$Enums.SupplierInvoiceStatus;
            createdAt: Date;
            updatedAt: Date;
            supplierId: string;
            approvedBy: string | null;
            approvedAt: Date | null;
            dueDate: Date | null;
            purchaseOrderId: string;
            paymentKey: string | null;
            paidBy: string | null;
            paidAt: Date | null;
            invoiceNumber: string;
            paymentAccountCode: string | null;
            paymentReference: string | null;
            matchedReceiptValue: number;
        };
        idempotent: boolean;
    }>;
}
export declare class SupplierStatementController {
    private readonly procurement;
    constructor(procurement: ProcurementService);
    list(supplierId?: string): import(".prisma/client").Prisma.PrismaPromise<({
        supplier: {
            id: string;
            name: string;
        };
        lines: ({
            matchedEntry: {
                id: string;
                sourceType: string;
                sourceRef: string;
                occurredAt: Date;
            } | null;
        } & {
            id: string;
            occurredAt: Date;
            amount: number;
            status: import(".prisma/client").$Enums.SupplierStatementLineStatus;
            createdAt: Date;
            externalId: string;
            reference: string | null;
            reconciliationKey: string | null;
            matchedBy: string | null;
            matchedAt: Date | null;
            matchedEntryId: string | null;
            statementId: string;
        })[];
    } & {
        id: string;
        idempotencyKey: string;
        createdBy: string;
        openingBalance: number;
        status: import(".prisma/client").$Enums.SupplierStatementStatus;
        createdAt: Date;
        updatedAt: Date;
        supplierId: string;
        statementNumber: string;
        periodStart: Date;
        periodEnd: Date;
        closingBalance: number;
    })[]>;
    import(user: AuthPrincipal, dto: ImportSupplierStatementDto): Promise<{
        idempotent: boolean;
        id: string;
        idempotencyKey: string;
        createdBy: string;
        openingBalance: number;
        status: import(".prisma/client").$Enums.SupplierStatementStatus;
        createdAt: Date;
        updatedAt: Date;
        supplierId: string;
        statementNumber: string;
        periodStart: Date;
        periodEnd: Date;
        closingBalance: number;
    }>;
    reconcile(user: AuthPrincipal, id: string, dto: ReconcileSupplierStatementLineDto): Promise<{
        idempotent: boolean;
        statement: {
            id: string;
            idempotencyKey: string;
            createdBy: string;
            openingBalance: number;
            status: import(".prisma/client").$Enums.SupplierStatementStatus;
            createdAt: Date;
            updatedAt: Date;
            supplierId: string;
            statementNumber: string;
            periodStart: Date;
            periodEnd: Date;
            closingBalance: number;
        };
        id: string;
        occurredAt: Date;
        amount: number;
        status: import(".prisma/client").$Enums.SupplierStatementLineStatus;
        createdAt: Date;
        externalId: string;
        reference: string | null;
        reconciliationKey: string | null;
        matchedBy: string | null;
        matchedAt: Date | null;
        matchedEntryId: string | null;
        statementId: string;
    }>;
}
export declare class LandedCostController {
    private readonly procurement;
    constructor(procurement: ProcurementService);
    list(purchaseOrderId?: string): import(".prisma/client").Prisma.PrismaPromise<({
        supplier: {
            id: string;
            name: string;
        };
        purchaseOrder: {
            number: string;
            id: string;
            location: string;
        };
        accountingEntry: {
            lines: {
                id: string;
                credit: number;
                debit: number;
                entryId: string;
                accountCode: string;
                memo: string | null;
            }[];
        } & {
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
        };
        allocations: ({
            product: {
                id: string;
                name: string;
                sku: string;
            };
            unit: {
                status: import(".prisma/client").$Enums.UnitStatus;
                imei: string;
                acquisitionCost: number | null;
            };
        } & {
            id: string;
            createdAt: Date;
            productId: string;
            imei: string;
            unitId: string;
            allocatedAmount: number;
            landedCostId: string;
            baseCost: number;
            resultingCost: number;
        })[];
    } & {
        id: string;
        idempotencyKey: string;
        description: string;
        accountingEntryId: string;
        amount: number;
        createdAt: Date;
        supplierId: string;
        purchaseOrderId: string;
        documentNumber: string;
        creditAccountCode: string;
        appliedAt: Date;
        appliedBy: string;
    })[]>;
    apply(user: AuthPrincipal, dto: CreateLandedCostDto): Promise<{
        idempotent: boolean;
        accountingEntry: {
            lines: {
                id: string;
                credit: number;
                debit: number;
                entryId: string;
                accountCode: string;
                memo: string | null;
            }[];
        } & {
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
        };
        allocations: {
            id: string;
            createdAt: Date;
            productId: string;
            imei: string;
            unitId: string;
            allocatedAmount: number;
            landedCostId: string;
            baseCost: number;
            resultingCost: number;
        }[];
        id: string;
        idempotencyKey: string;
        description: string;
        accountingEntryId: string;
        amount: number;
        createdAt: Date;
        supplierId: string;
        purchaseOrderId: string;
        documentNumber: string;
        creditAccountCode: string;
        appliedAt: Date;
        appliedBy: string;
    }>;
}
