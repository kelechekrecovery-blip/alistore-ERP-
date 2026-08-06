import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignServiceTechnicianDto, CreatePaidRepairDto, CreateServiceWorkOrderDto, DiagnoseServiceWorkOrderDto, PayServiceWorkOrderDto } from './service-center.dto';
export declare class ServiceCenterService {
    private readonly prisma;
    private readonly audit;
    private readonly outbox?;
    constructor(prisma: PrismaService, audit: AuditService, outbox?: OutboxService | undefined);
    queue(actor: string): Promise<{
        slaState: string;
        productName: string;
        customer: {
            id: string;
            name: string;
            phone: string;
        } | null;
        workOrder: ({
            payments: {
                id: string;
                idempotencyKey: string | null;
                point: string | null;
                accountCode: string | null;
                accountingEntryId: string | null;
                txnId: string | null;
                orderId: string | null;
                serviceWorkOrderId: string | null;
                originalPaymentId: string | null;
                giftCardId: string | null;
                amount: number;
                method: import(".prisma/client").$Enums.PaymentMethod;
                status: import(".prisma/client").$Enums.PaymentStatus;
                shiftId: string | null;
                receivedBy: string | null;
                createdAt: Date;
            }[];
            parts: ({
                product: {
                    id: string;
                    name: string;
                    sku: string;
                    cost: number;
                };
            } & {
                id: string;
                status: import(".prisma/client").$Enums.ServicePartStatus;
                location: string;
                productId: string;
                balanceId: string;
                consumedAt: Date | null;
                qty: number;
                workOrderId: string;
                releasedAt: Date | null;
                movementId: string | null;
                reservedAt: Date;
                reservedBy: string;
                consumedBy: string | null;
                releasedBy: string | null;
            })[];
        } & {
            id: string;
            point: string;
            taxCode: string;
            taxRateBps: number;
            taxAmount: number;
            createdBy: string;
            createdAt: Date;
            updatedAt: Date;
            taxBaseAmount: number;
            estimateAmount: number | null;
            warrantyCaseId: string;
            replacementImei: string | null;
            technicianId: string | null;
            diagnosticSummary: string | null;
            diagnosticFee: number;
            estimatePreparedAt: Date | null;
            estimateApprovedAt: Date | null;
            estimateApprovedBy: string | null;
            repairStartedAt: Date | null;
            repairCompletedAt: Date | null;
            repairClosedAt: Date | null;
            repairWarrantyUntil: Date | null;
            completionSummary: string | null;
        }) | null;
        id: string;
        status: import(".prisma/client").$Enums.WarrantyStatus;
        imei: string;
        customerId: string;
        assignee: string | null;
        problem: string;
        serviceType: import(".prisma/client").$Enums.ServiceCaseType;
        deviceName: string | null;
        sla: Date;
        slaEscalatedAt: Date | null;
    }[]>;
    mine(customerId: string): Prisma.PrismaPromise<({
        warrantyCase: {
            id: string;
            status: import(".prisma/client").$Enums.WarrantyStatus;
            imei: string;
            customerId: string;
            assignee: string | null;
            problem: string;
            serviceType: import(".prisma/client").$Enums.ServiceCaseType;
            deviceName: string | null;
            sla: Date;
            slaEscalatedAt: Date | null;
        };
        payments: {
            id: string;
            idempotencyKey: string | null;
            point: string | null;
            accountCode: string | null;
            accountingEntryId: string | null;
            txnId: string | null;
            orderId: string | null;
            serviceWorkOrderId: string | null;
            originalPaymentId: string | null;
            giftCardId: string | null;
            amount: number;
            method: import(".prisma/client").$Enums.PaymentMethod;
            status: import(".prisma/client").$Enums.PaymentStatus;
            shiftId: string | null;
            receivedBy: string | null;
            createdAt: Date;
        }[];
        parts: ({
            product: {
                id: string;
                name: string;
                sku: string;
            };
        } & {
            id: string;
            status: import(".prisma/client").$Enums.ServicePartStatus;
            location: string;
            productId: string;
            balanceId: string;
            consumedAt: Date | null;
            qty: number;
            workOrderId: string;
            releasedAt: Date | null;
            movementId: string | null;
            reservedAt: Date;
            reservedBy: string;
            consumedBy: string | null;
            releasedBy: string | null;
        })[];
    } & {
        id: string;
        point: string;
        taxCode: string;
        taxRateBps: number;
        taxAmount: number;
        createdBy: string;
        createdAt: Date;
        updatedAt: Date;
        taxBaseAmount: number;
        estimateAmount: number | null;
        warrantyCaseId: string;
        replacementImei: string | null;
        technicianId: string | null;
        diagnosticSummary: string | null;
        diagnosticFee: number;
        estimatePreparedAt: Date | null;
        estimateApprovedAt: Date | null;
        estimateApprovedBy: string | null;
        repairStartedAt: Date | null;
        repairCompletedAt: Date | null;
        repairClosedAt: Date | null;
        repairWarrantyUntil: Date | null;
        completionSummary: string | null;
    })[]>;
    paymentContext(id: string, actor: string): Promise<{
        id: string;
        warrantyCaseId: string;
        diagnosticSummary: string | null;
        estimateAmount: number | null;
        estimateApprovedAt: Date | null;
        point: string;
        warrantyCase: {
            id: string;
            imei: string;
            customerId: string;
            status: import(".prisma/client").$Enums.WarrantyStatus;
            serviceType: "paid";
            deviceName: string | null;
        };
        customer: {
            id: string;
            name: string;
            phone: string;
        } | null;
        paidTotal: number;
    }>;
    pay(id: string, dto: PayServiceWorkOrderDto, actor: string, rawKey?: string): Promise<unknown>;
    create(dto: CreateServiceWorkOrderDto, actor: string, rawKey?: string): Promise<unknown>;
    createPaidRepair(dto: CreatePaidRepairDto, actor: string, rawKey?: string): Promise<unknown>;
    diagnose(id: string, dto: DiagnoseServiceWorkOrderDto, actor: string, rawKey?: string): Promise<unknown>;
    approveEstimate(id: string, customerId: string, rawKey?: string): Promise<unknown>;
    assign(id: string, dto: AssignServiceTechnicianDto, actor: string, rawKey?: string): Promise<unknown>;
}
