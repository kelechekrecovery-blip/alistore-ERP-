import { AuthPrincipal } from '../auth/jwt.strategy';
import { AssignServiceTechnicianDto, CompleteServiceRepairDto, CreatePaidRepairDto, CreateServiceWorkOrderDto, DiagnoseServiceWorkOrderDto, PayServiceWorkOrderDto, PrepareLoanerLoanDto, RegisterLoanerDeviceDto, ReplaceServiceDeviceDto, ReserveServicePartDto, ResolveLoanerDisputeDto, ReturnLoanerLoanDto } from './service-center.dto';
import { ServiceCenterService } from './service-center.service';
import { ServiceExecutionService } from './service-execution.service';
import { ServiceLoanerService } from './service-loaner.service';
export declare class ServiceCenterController {
    private readonly serviceCenter;
    private readonly execution;
    private readonly loaners;
    constructor(serviceCenter: ServiceCenterService, execution: ServiceExecutionService, loaners: ServiceLoanerService);
    loanerFund(user: AuthPrincipal): Promise<({
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
    registerLoaner(user: AuthPrincipal, key: string | undefined, dto: RegisterLoanerDeviceDto): Promise<{
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
    prepareLoaner(user: AuthPrincipal, id: string, key: string | undefined, dto: PrepareLoanerLoanDto): Promise<unknown>;
    issueLoaner(user: AuthPrincipal, id: string, key: string | undefined): Promise<unknown>;
    cancelLoaner(user: AuthPrincipal, id: string, key: string | undefined): Promise<unknown>;
    returnLoaner(user: AuthPrincipal, id: string, key: string | undefined, dto: ReturnLoanerLoanDto): Promise<unknown>;
    resolveLoanerDispute(user: AuthPrincipal, id: string, key: string | undefined, dto: ResolveLoanerDisputeDto): Promise<unknown>;
    queue(user: AuthPrincipal): Promise<{
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
    create(user: AuthPrincipal, key: string | undefined, dto: CreateServiceWorkOrderDto): Promise<unknown>;
    createPaidRepair(user: AuthPrincipal, key: string | undefined, dto: CreatePaidRepairDto): Promise<unknown>;
    assign(user: AuthPrincipal, id: string, key: string | undefined, dto: AssignServiceTechnicianDto): Promise<unknown>;
    diagnose(user: AuthPrincipal, id: string, key: string | undefined, dto: DiagnoseServiceWorkOrderDto): Promise<unknown>;
    reservePart(user: AuthPrincipal, id: string, key: string | undefined, dto: ReserveServicePartDto): Promise<unknown>;
    releasePart(user: AuthPrincipal, id: string, partId: string, key: string | undefined): Promise<unknown>;
    consumePart(user: AuthPrincipal, id: string, partId: string, key: string | undefined): Promise<unknown>;
    start(user: AuthPrincipal, id: string, key: string | undefined): Promise<unknown>;
    complete(user: AuthPrincipal, id: string, key: string | undefined, dto: CompleteServiceRepairDto): Promise<unknown>;
    replace(user: AuthPrincipal, id: string, key: string | undefined, dto: ReplaceServiceDeviceDto): Promise<unknown>;
    close(user: AuthPrincipal, id: string, key: string | undefined): Promise<unknown>;
    paymentContext(user: AuthPrincipal, id: string): Promise<{
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
    pay(user: AuthPrincipal, id: string, key: string | undefined, dto: PayServiceWorkOrderDto): Promise<unknown>;
    mine(user: AuthPrincipal): import(".prisma/client").Prisma.PrismaPromise<({
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
    myLoaners(user: AuthPrincipal): import(".prisma/client").Prisma.PrismaPromise<({
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
    approveEstimate(user: AuthPrincipal, id: string, key: string | undefined): Promise<unknown>;
}
