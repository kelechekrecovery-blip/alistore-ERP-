declare const RMA_TARGETS: readonly ["shipped", "accepted", "repaired", "replaced", "refunded", "rejected", "closed"];
export declare class CreateSupplierDto {
    name: string;
    contact?: string;
}
export declare class OpenRmaDto {
    supplierId: string;
    imei: string;
    defect: string;
    actor?: string;
}
export declare class RmaTransitionDto {
    to: (typeof RMA_TARGETS)[number];
    actor?: string;
}
export {};
