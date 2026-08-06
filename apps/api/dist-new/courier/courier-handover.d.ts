export type CourierHandoverPayload = {
    amount: number;
    reason: string | null;
};
export declare function replayCourierHandover<T extends {
    id: string;
    courierId: string;
    codTotal: number;
    collectedTotal?: number;
    handoverAmount: number | null;
    handoverReason: string | null;
}>(run: T, runId: string, payload: CourierHandoverPayload): T & {
    diff: number;
};
export declare function assertCourierRunOwner(run: {
    courierId: string;
}, expectedCourierId?: string): void;
