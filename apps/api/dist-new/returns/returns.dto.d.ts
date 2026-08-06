declare const RETURN_STATUSES: readonly ["requested", "under_review", "approved", "rejected", "processing", "paid", "reconciled"];
export declare class CreateReturnDto {
    orderId: string;
    reason: string;
    requester?: string;
    items?: ReturnSelectionDto[];
}
export declare class CreateMineReturnDto {
    orderId: string;
    reason: string;
    items?: ReturnSelectionDto[];
}
export declare class ReturnSelectionDto {
    orderItemId: string;
    qty: number;
}
export declare class ReturnStatusDto {
    status: (typeof RETURN_STATUSES)[number];
    location?: string;
}
export {};
