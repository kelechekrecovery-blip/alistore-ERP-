declare const STATUSES: readonly ["created", "received", "diagnostics", "waiting_supplier", "approved", "rejected", "repaired", "replaced", "closed"];
export declare class OpenWarrantyDto {
    imei: string;
    customerId: string;
    problem: string;
}
export declare class WarrantyStatusDto {
    status: (typeof STATUSES)[number];
}
export {};
