export declare class CreateRefundDto {
    reason: string;
    shiftId?: string;
}
export declare class CancelRefundDto {
    reason: string;
}
export declare class ResolveRefundDto {
    action: 'confirm' | 'cancel';
    reason: string;
    providerReference?: string;
}
export declare class RetryRefundDto {
    shiftId?: string;
}
