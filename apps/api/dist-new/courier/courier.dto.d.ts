export declare class CreateRunDto {
    courierId: string;
    codTotal: number;
    orderIds?: string[];
}
export declare class HandoverDto {
    runId: string;
    amount: number;
    reason?: string;
}
export declare class FailDeliveryDto {
    reason: string;
    evidence?: Record<string, unknown>;
    evidenceIdempotencyKey?: string;
}
export declare class RemoveFromRunDto {
    reason: string;
}
export declare class CompleteDeliveryDto {
    codAmount: number;
    reason?: string;
    evidenceIdempotencyKey?: string;
}
