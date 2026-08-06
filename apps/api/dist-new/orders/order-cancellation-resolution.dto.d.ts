import { OrderCancellationFaultParty, OrderCancellationResolutionAction } from '@prisma/client';
export declare class ResolveOrderCancellationDto {
    action: OrderCancellationResolutionAction;
    refundAmount?: number;
    supplierExpenseAmount?: number;
    faultParty?: OrderCancellationFaultParty;
    ownerReason: string;
    evidenceIds?: string[];
    totpToken: string;
}
