import { PaymentMethod } from '@prisma/client';
export declare class CreateServiceWorkOrderDto {
    warrantyCaseId: string;
    technicianId?: string;
}
export declare class DiagnoseServiceWorkOrderDto {
    summary: string;
    estimateAmount: number;
    diagnosticFee?: number;
}
export declare class CreatePaidRepairDto {
    phone: string;
    customerName: string;
    deviceName: string;
    serial: string;
    problem: string;
    technicianId?: string;
}
export declare class ServicePaymentTenderDto {
    method: PaymentMethod;
    amount: number;
}
export declare class PayServiceWorkOrderDto {
    payments: ServicePaymentTenderDto[];
}
export declare class ReserveServicePartDto {
    productId: string;
    qty: number;
}
export declare class CompleteServiceRepairDto {
    summary: string;
}
export declare class AssignServiceTechnicianDto {
    technicianId: string;
}
export declare class ReplaceServiceDeviceDto {
    replacementImei: string;
    summary: string;
}
export declare class RegisterLoanerDeviceDto {
    imei: string;
    condition: string;
}
export declare class PrepareLoanerLoanDto {
    loanerDeviceId: string;
    dueAt: string;
    issueCondition: string;
    depositAmount?: number;
    agreementRef?: string;
}
export declare class ReturnLoanerLoanDto {
    returnCondition: string;
    damageNote?: string;
}
export declare class ResolveLoanerDisputeDto {
    disposition: 'available' | 'written_off';
}
