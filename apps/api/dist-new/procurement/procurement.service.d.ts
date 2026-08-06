import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApplySupplierAdvanceDto, CreateLandedCostDto, CreatePurchaseOrderDto, CreateSupplierAdvanceDto, CreateSupplierCreditNoteDto, CreateSupplierInvoiceDto, CreateSupplierInvoicePaymentDto, ImportSupplierStatementDto, PaySupplierInvoiceDto, ReceivePurchaseOrderDto, ReconcileSupplierStatementLineDto } from './procurement.dto';
export declare class ProcurementService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    list(status?: string): Prisma.PrismaPromise<({
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
    create(dto: CreatePurchaseOrderDto, actor: string): Promise<{
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
    send(id: string, actor: string): Promise<{
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
    cancel(id: string, actor: string): Promise<{
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
    receive(id: string, dto: ReceivePurchaseOrderDto, actor: string): Promise<{
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
    listInvoices(status?: string): Prisma.PrismaPromise<({
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
    createSupplierInvoice(dto: CreateSupplierInvoiceDto, actor: string): Promise<{
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
    approveSupplierInvoice(id: string, actor: string): Promise<{
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
    paySupplierInvoice(id: string, dto: PaySupplierInvoiceDto, actor: string): Promise<{
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
    createSupplierInvoicePayment(id: string, dto: CreateSupplierInvoicePaymentDto, actor: string): Promise<{
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
    private recordSupplierInvoicePayment;
    listSupplierAdvances(supplierId?: string): Prisma.PrismaPromise<({
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
    createSupplierAdvance(dto: CreateSupplierAdvanceDto, actor: string): Promise<{
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
    applySupplierAdvance(id: string, dto: ApplySupplierAdvanceDto, actor: string): Promise<{
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
    listSupplierStatements(supplierId?: string): Prisma.PrismaPromise<({
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
    importSupplierStatement(dto: ImportSupplierStatementDto, actor: string): Promise<{
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
    reconcileSupplierStatementLine(id: string, dto: ReconcileSupplierStatementLineDto, actor: string): Promise<{
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
    listLandedCosts(purchaseOrderId?: string): Prisma.PrismaPromise<({
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
    createLandedCost(dto: CreateLandedCostDto, actor: string): Promise<{
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
    listCreditNotes(supplierId?: string): Prisma.PrismaPromise<({
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
    createCreditNote(dto: CreateSupplierCreditNoteDto, actor: string): Promise<{
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
    approveCreditNote(id: string, actor: string): Promise<{
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
    applyCreditNote(id: string, actor: string): Promise<{
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
