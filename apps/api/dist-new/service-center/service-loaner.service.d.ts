import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { PrepareLoanerLoanDto, RegisterLoanerDeviceDto, ReturnLoanerLoanDto } from './service-center.dto';
export declare class ServiceLoanerService {
    private readonly prisma;
    private readonly audit;
    private readonly outbox?;
    constructor(prisma: PrismaService, audit: AuditService, outbox?: OutboxService | undefined);
    list(actor: string): Promise<({
        unit: {
            product: {
                id: string;
                name: string;
                sku: string;
            };
        } & {
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
        loans: ({
            workOrder: {
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
            };
        } & {
            id: string;
            status: import(".prisma/client").$Enums.LoanerLoanStatus;
            createdAt: Date;
            updatedAt: Date;
            customerId: string;
            workOrderId: string;
            returnedAt: Date | null;
            dueAt: Date;
            issuedBy: string | null;
            issuedAt: Date | null;
            deviceId: string;
            issueCondition: string;
            returnCondition: string | null;
            damageNote: string | null;
            depositAmount: number;
            agreementRef: string | null;
            preparedBy: string;
            preparedAt: Date;
            returnedBy: string | null;
            overdueEscalatedAt: Date | null;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        unitId: string;
        condition: string;
        registeredBy: string;
        registrationIdempotencyKey: string;
    })[]>;
    mine(customerId: string): Prisma.PrismaPromise<({
        workOrder: {
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
        };
        device: {
            unit: {
                product: {
                    id: string;
                    name: string;
                    sku: string;
                };
            } & {
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
            createdAt: Date;
            updatedAt: Date;
            active: boolean;
            unitId: string;
            condition: string;
            registeredBy: string;
            registrationIdempotencyKey: string;
        };
    } & {
        id: string;
        status: import(".prisma/client").$Enums.LoanerLoanStatus;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        workOrderId: string;
        returnedAt: Date | null;
        dueAt: Date;
        issuedBy: string | null;
        issuedAt: Date | null;
        deviceId: string;
        issueCondition: string;
        returnCondition: string | null;
        damageNote: string | null;
        depositAmount: number;
        agreementRef: string | null;
        preparedBy: string;
        preparedAt: Date;
        returnedBy: string | null;
        overdueEscalatedAt: Date | null;
    })[]>;
    register(dto: RegisterLoanerDeviceDto, actor: string, rawKey?: string): Promise<{
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
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        unitId: string;
        condition: string;
        registeredBy: string;
        registrationIdempotencyKey: string;
    }>;
    prepare(workOrderId: string, dto: PrepareLoanerLoanDto, actor: string, rawKey?: string): Promise<unknown>;
    issue(loanId: string, actor: string, rawKey?: string): Promise<unknown>;
    cancel(loanId: string, actor: string, rawKey?: string): Promise<unknown>;
    returnLoan(loanId: string, dto: ReturnLoanerLoanDto, actor: string, rawKey?: string): Promise<unknown>;
    resolveDispute(loanId: string, disposition: 'available' | 'written_off', actor: string, rawKey?: string): Promise<unknown>;
    private loanCommand;
    private command;
    private requireEvidence;
    private lockWorkOrder;
    private activeStaff;
    private assertPointAccess;
    private assertWorkOrderAccess;
    private assertRegistrationReplay;
    private assertRegistrationAccess;
    private assertRegistrationStaffAccess;
}
