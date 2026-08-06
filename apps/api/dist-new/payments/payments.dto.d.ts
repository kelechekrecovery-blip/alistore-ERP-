import { PaymentMethod } from '@prisma/client';
export declare class PayDto {
    orderId: string;
    method: PaymentMethod;
    amount: number;
    txnId?: string;
    shiftId?: string;
    giftCardCode?: string;
}
export declare class SettleOrderReceivableDto {
    method: PaymentMethod;
    amount: number;
    txnId?: string;
    shiftId?: string;
}
export declare class RefundAllocationDto {
    paymentId: string;
    amount: number;
    shiftId?: string;
    externalReference?: string;
}
export declare class RefundDto {
    amount: number;
    reason: string;
    requester?: string;
    returnId?: string;
    shiftId?: string;
    externalReference?: string;
    allocations?: RefundAllocationDto[];
}
export declare class VoidPaymentDto {
    reason: string;
}
