import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { CountDto, CreateConsignmentPayoutDto, DiagnoseQuarantineDto, DisposeQuarantineDto, MovementDto, PayConsignmentPayoutDto, ReceiveConsignmentDto, ReceiveQuantityConsignmentDto, ReceiveDto, ReceiveQuantityDto, TransferDto, TransferQuantityDto } from './inventory.dto';
type QuarantineDispositionResult = {
    approvalId: string;
    status: 'requested';
} | Prisma.InventoryQuarantineCaseGetPayload<{
    include: {
        unit: {
            include: {
                product: true;
            };
        };
    };
}>;
type QuarantineDisposedCase = Exclude<QuarantineDispositionResult, {
    approvalId: string;
    status: 'requested';
}>;
export interface InventoryDiscrepancyRow {
    productId: string;
    sku: string;
    name: string;
    location: string;
    valueDifference: number;
    quantityDifference: number;
    reservationDifference: number;
    missingCostUnits: number;
}
export declare class InventoryService {
    private readonly prisma;
    private readonly audit;
    private readonly approvals;
    constructor(prisma: PrismaService, audit: AuditService, approvals: ApprovalsService);
    private actorStorePoint;
    private activeLocation;
    private mutationLocation;
    valuationReconciliation(): Promise<{
        generatedAt: string;
        scope: string;
        summary: {
            quantityValue: number;
            serializedValue: number;
            ownedInventoryValue: number;
            glInventoryBalance: number;
            difference: number;
            inconsistentQuantityRows: number;
            missingSerializedCostUnits: number;
            complete: boolean;
            consistent: boolean;
            topDiscrepancies: InventoryDiscrepancyRow[];
            topDiscrepanciesTruncated: number;
        };
        quantity: {
            productId: string;
            sku: string;
            name: string;
            location: string;
            onHand: number;
            reserved: number;
            consignmentQty: number;
            ownedPhysicalQty: number;
            layerQty: number;
            inventoryValue: number;
            layerValue: number;
            quantityDifference: number;
            valueDifference: number;
            reservationDifference: number;
            consistent: boolean;
        }[];
        serialized: {
            productId: string;
            sku: string;
            name: string;
            location: string;
            units: number;
            inventoryValue: number;
            missingCostUnits: number;
        }[];
    }>;
    valuationRollForward(from: string, to: string): Promise<{
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
        rows: {
            productId: string;
            sku: string;
            name: string;
            location: string;
            opening: {
                quantity: number;
                value: number;
            };
            receipts: {
                quantity: number;
                value: number;
            };
            returns: {
                quantity: number;
                value: number;
            };
            transferIn: {
                quantity: number;
                value: number;
            };
            transferOut: {
                quantity: number;
                value: number;
            };
            issues: {
                quantity: number;
                value: number;
            };
            adjustmentsIn: {
                quantity: number;
                value: number;
            };
            adjustmentsOut: {
                quantity: number;
                value: number;
            };
            closing: {
                quantity: number;
                value: number;
            };
        }[];
    }>;
    listQuarantine(): Promise<({
        unit: {
            product: {
                id: string;
                name: string;
                sku: string;
            };
            status: import(".prisma/client").$Enums.UnitStatus;
            location: string;
            imei: string;
            acquisitionCost: number | null;
        };
    } & {
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
    })[]>;
    diagnoseQuarantine(id: string, dto: DiagnoseQuarantineDto, actor: string): Promise<{
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
    }>;
    disposeQuarantine(id: string, dto: DisposeQuarantineDto & {
        disposition: 'write_off';
    }, actor: string): Promise<{
        approvalId: string;
        status: 'requested';
    }>;
    disposeQuarantine(id: string, dto: DisposeQuarantineDto & {
        disposition: 'repair';
    }, actor: string): Promise<QuarantineDisposedCase & {
        repairWorkOrderId: string;
    }>;
    disposeQuarantine(id: string, dto: DisposeQuarantineDto & {
        disposition: 'restock';
    }, actor: string): Promise<QuarantineDisposedCase>;
    disposeQuarantine(id: string, dto: DisposeQuarantineDto, actor: string): Promise<QuarantineDispositionResult>;
    movement(dto: MovementDto, requester: string, idempotencyKey?: string): Promise<{
        approvalId: string;
        status: "requested";
    }>;
    receive(dto: ReceiveDto, actor: string): Promise<{
        productId: string;
        location: string;
        received: number;
        imeis: string[];
        movementId: string;
    }>;
    receiveQuantity(dto: ReceiveQuantityDto, actor: string): Promise<{
        productId: string;
        location: string;
        received: number;
        onHand: number;
        reserved: number;
        available: number;
        movementId: string;
    }>;
    receiveConsignment(dto: ReceiveConsignmentDto, actor: string): Promise<{
        product: {
            id: string;
            name: string;
            taxCode: string;
            taxRateBps: number;
            updatedAt: Date;
            sku: string;
            barcode: string | null;
            variantGroup: string | null;
            price: number;
            cost: number;
            category: string;
            trackingMode: import(".prisma/client").$Enums.StockTrackingMode;
            supplyMode: import(".prisma/client").$Enums.SupplyMode;
            supplyLeadDays: number | null;
            sellerId: string | null;
            supplierId: string | null;
            attrs: Prisma.JsonValue;
            archived: boolean;
        };
        unit: {
            id: string;
            orderId: string | null;
            status: import(".prisma/client").$Enums.UnitStatus;
            updatedAt: Date;
            location: string;
            productId: string;
            imei: string;
            grade: import(".prisma/client").$Enums.Grade | null;
            acquisitionCost: number | null;
            supplyQuarantineResolutionId: string | null;
        };
    } & {
        id: string;
        idempotencyKey: string;
        createdBy: string;
        status: import(".prisma/client").$Enums.ConsignmentStatus;
        createdAt: Date;
        updatedAt: Date;
        productId: string;
        unitId: string;
        ownerName: string;
        ownerContact: string | null;
        commissionBps: number;
        saleOrderId: string | null;
        salePrice: number | null;
        commissionAmount: number | null;
        ownerAmount: number | null;
        soldAt: Date | null;
        payoutId: string | null;
    }>;
    receiveQuantityConsignment(dto: ReceiveQuantityConsignmentDto, actor: string): Promise<{
        id: string;
        idempotencyKey: string;
        createdBy: string;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        productId: string;
        balanceId: string;
        ownerName: string;
        ownerContact: string | null;
        commissionBps: number;
        receivedQty: number;
        availableQty: number;
        reservedQty: number;
    }>;
    listConsignments(): Prisma.PrismaPromise<({
        product: {
            id: string;
            name: string;
            sku: string;
            price: number;
        };
        unit: {
            status: import(".prisma/client").$Enums.UnitStatus;
            location: string;
            imei: string;
        };
        saleOrder: {
            id: string;
            status: import(".prisma/client").$Enums.OrderStatus;
            createdAt: Date;
        } | null;
        payout: {
            id: string;
            status: import(".prisma/client").$Enums.ConsignmentPayoutStatus;
            paidAt: Date | null;
        } | null;
    } & {
        id: string;
        idempotencyKey: string;
        createdBy: string;
        status: import(".prisma/client").$Enums.ConsignmentStatus;
        createdAt: Date;
        updatedAt: Date;
        productId: string;
        unitId: string;
        ownerName: string;
        ownerContact: string | null;
        commissionBps: number;
        saleOrderId: string | null;
        salePrice: number | null;
        commissionAmount: number | null;
        ownerAmount: number | null;
        soldAt: Date | null;
        payoutId: string | null;
    })[]>;
    listQuantityConsignments(): Prisma.PrismaPromise<({
        product: {
            id: string;
            name: string;
            sku: string;
            price: number;
        };
        allocations: ({
            saleOrder: {
                id: string;
                status: import(".prisma/client").$Enums.OrderStatus;
                createdAt: Date;
            } | null;
            payout: {
                id: string;
                status: import(".prisma/client").$Enums.ConsignmentPayoutStatus;
                paidAt: Date | null;
            } | null;
        } & {
            id: string;
            status: import(".prisma/client").$Enums.ConsignmentStatus;
            createdAt: Date;
            updatedAt: Date;
            saleOrderId: string | null;
            salePrice: number | null;
            commissionAmount: number | null;
            ownerAmount: number | null;
            soldAt: Date | null;
            payoutId: string | null;
            qty: number;
            returnedQty: number;
            returnedSaleAmount: number;
            returnedCommissionAmount: number;
            returnedOwnerAmount: number;
            returnedAt: Date | null;
            lotId: string;
            orderQuantityAllocationId: string;
        })[];
    } & {
        id: string;
        idempotencyKey: string;
        createdBy: string;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        productId: string;
        balanceId: string;
        ownerName: string;
        ownerContact: string | null;
        commissionBps: number;
        receivedQty: number;
        availableQty: number;
        reservedQty: number;
    })[]>;
    listConsignmentPayouts(): Prisma.PrismaPromise<({
        quantityAllocations: {
            id: string;
            saleOrderId: string | null;
            ownerAmount: number | null;
            qty: number;
            returnedQty: number;
            returnedOwnerAmount: number;
        }[];
        items: {
            id: string;
            saleOrderId: string | null;
            ownerAmount: number | null;
        }[];
    } & {
        id: string;
        idempotencyKey: string;
        createdBy: string;
        status: import(".prisma/client").$Enums.ConsignmentPayoutStatus;
        createdAt: Date;
        updatedAt: Date;
        ownerName: string;
        ownerContact: string | null;
        commissionAmount: number;
        ownerAmount: number;
        grossAmount: number;
        paymentKey: string | null;
        paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
        paidBy: string | null;
        paidAt: Date | null;
    })[]>;
    listConsignmentAdjustments(): Promise<({
        id: string;
        createdBy: string;
        amount: number;
        status: import(".prisma/client").$Enums.ConsignmentAdjustmentStatus;
        createdAt: Date;
        returnId: string;
        ownerName: string;
        ownerContact: string | null;
        payoutId: string;
        reason: string;
        allocationId: string;
        settledBy: string | null;
        settledAt: Date | null;
    } | {
        id: string;
        createdBy: string;
        amount: number;
        status: import(".prisma/client").$Enums.ConsignmentAdjustmentStatus;
        createdAt: Date;
        returnId: string;
        ownerName: string;
        ownerContact: string | null;
        payoutId: string;
        reason: string;
        itemId: string;
        settledBy: string | null;
        settledAt: Date | null;
    })[]>;
    createConsignmentPayout(dto: CreateConsignmentPayoutDto, actor: string): Promise<{
        quantityAllocations: {
            id: string;
            status: import(".prisma/client").$Enums.ConsignmentStatus;
            createdAt: Date;
            updatedAt: Date;
            saleOrderId: string | null;
            salePrice: number | null;
            commissionAmount: number | null;
            ownerAmount: number | null;
            soldAt: Date | null;
            payoutId: string | null;
            qty: number;
            returnedQty: number;
            returnedSaleAmount: number;
            returnedCommissionAmount: number;
            returnedOwnerAmount: number;
            returnedAt: Date | null;
            lotId: string;
            orderQuantityAllocationId: string;
        }[];
        items: {
            id: string;
            idempotencyKey: string;
            createdBy: string;
            status: import(".prisma/client").$Enums.ConsignmentStatus;
            createdAt: Date;
            updatedAt: Date;
            productId: string;
            unitId: string;
            ownerName: string;
            ownerContact: string | null;
            commissionBps: number;
            saleOrderId: string | null;
            salePrice: number | null;
            commissionAmount: number | null;
            ownerAmount: number | null;
            soldAt: Date | null;
            payoutId: string | null;
        }[];
    } & {
        id: string;
        idempotencyKey: string;
        createdBy: string;
        status: import(".prisma/client").$Enums.ConsignmentPayoutStatus;
        createdAt: Date;
        updatedAt: Date;
        ownerName: string;
        ownerContact: string | null;
        commissionAmount: number;
        ownerAmount: number;
        grossAmount: number;
        paymentKey: string | null;
        paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
        paidBy: string | null;
        paidAt: Date | null;
    }>;
    payConsignmentPayout(id: string, dto: PayConsignmentPayoutDto, actor: string): Promise<{
        quantityAllocations: {
            id: string;
            status: import(".prisma/client").$Enums.ConsignmentStatus;
            createdAt: Date;
            updatedAt: Date;
            saleOrderId: string | null;
            salePrice: number | null;
            commissionAmount: number | null;
            ownerAmount: number | null;
            soldAt: Date | null;
            payoutId: string | null;
            qty: number;
            returnedQty: number;
            returnedSaleAmount: number;
            returnedCommissionAmount: number;
            returnedOwnerAmount: number;
            returnedAt: Date | null;
            lotId: string;
            orderQuantityAllocationId: string;
        }[];
        items: {
            id: string;
            idempotencyKey: string;
            createdBy: string;
            status: import(".prisma/client").$Enums.ConsignmentStatus;
            createdAt: Date;
            updatedAt: Date;
            productId: string;
            unitId: string;
            ownerName: string;
            ownerContact: string | null;
            commissionBps: number;
            saleOrderId: string | null;
            salePrice: number | null;
            commissionAmount: number | null;
            ownerAmount: number | null;
            soldAt: Date | null;
            payoutId: string | null;
        }[];
    } & {
        id: string;
        idempotencyKey: string;
        createdBy: string;
        status: import(".prisma/client").$Enums.ConsignmentPayoutStatus;
        createdAt: Date;
        updatedAt: Date;
        ownerName: string;
        ownerContact: string | null;
        commissionAmount: number;
        ownerAmount: number;
        grossAmount: number;
        paymentKey: string | null;
        paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
        paidBy: string | null;
        paidAt: Date | null;
    }>;
    count(dto: CountDto, actor: string, idempotencyKey?: string): Promise<{
        productId: string;
        location: string;
        expected: number;
        counted: number;
        diff: number;
        movementId: string;
        fingerprint: string;
    }>;
    transfer(dto: TransferDto, actor: string): Promise<{
        imei: string;
        from: string;
        to: string;
        movementId: string;
    }>;
    transferQuantity(dto: TransferQuantityDto, actor: string): Promise<{
        movementId: string;
        productId: string;
        from: string;
        to: string;
        qty: number;
        totalValue: number;
        idempotent: boolean;
    }>;
}
export {};
