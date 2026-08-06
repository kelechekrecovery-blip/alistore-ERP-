import { PaymentMethod } from '@prisma/client';
export declare class CountDto {
    productId: string;
    location: string;
    counted: number;
    requester?: string;
}
export declare class TransferDto {
    imei: string;
    to: string;
    reason?: string;
    requester?: string;
}
export declare class TransferQuantityDto {
    idempotencyKey: string;
    productId: string;
    from: string;
    to: string;
    qty: number;
    reason?: string;
}
export declare class ReceiveDto {
    productId: string;
    location: string;
    imeis: string[];
    unitCost?: number;
    grade?: 'A' | 'B' | 'C';
    reason?: string;
}
export declare class ReceiveQuantityDto {
    idempotencyKey: string;
    productId: string;
    location: string;
    quantity: number;
    unitCost?: number;
    reason?: string;
}
export declare class DiagnoseQuarantineDto {
    diagnosis: 'resellable' | 'repair' | 'write_off';
    notes?: string;
}
export declare class DisposeQuarantineDto {
    disposition: 'restock' | 'repair' | 'write_off';
}
export declare class ValuationRollForwardQueryDto {
    from: string;
    to: string;
}
export declare class ReceiveConsignmentDto {
    idempotencyKey: string;
    productId: string;
    imei: string;
    location: string;
    ownerName: string;
    ownerContact?: string;
    commissionBps: number;
    grade?: 'A' | 'B' | 'C';
}
export declare class ReceiveQuantityConsignmentDto {
    idempotencyKey: string;
    productId: string;
    location: string;
    quantity: number;
    ownerName: string;
    ownerContact?: string;
    commissionBps: number;
}
export declare class CreateConsignmentPayoutDto {
    idempotencyKey: string;
    itemIds?: string[];
    quantityAllocationIds?: string[];
}
export declare class PayConsignmentPayoutDto {
    paymentKey: string;
    paymentMethod?: PaymentMethod;
}
export declare class MovementDto {
    productId: string;
    qty: number;
    type: 'write_off' | 'adjust';
    location?: string;
    direction?: 'increase' | 'decrease';
    reason: string;
    countMovementId?: string;
    requester?: string;
}
