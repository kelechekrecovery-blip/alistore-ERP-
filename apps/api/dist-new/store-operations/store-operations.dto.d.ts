declare const CHECKLIST_TYPES: readonly ["opening", "closing"];
declare const INCIDENT_SEVERITIES: readonly ["low", "medium", "high", "critical"];
export declare class StoreOperationsQueryDto {
    point?: string;
    date?: string;
    status?: 'open' | 'investigating' | 'resolved';
}
export declare class CreateStoreChecklistDto {
    point: string;
    type: (typeof CHECKLIST_TYPES)[number];
    businessDate: string;
}
export declare class UpdateChecklistItemDto {
    checked: boolean;
    note?: string;
}
export declare class CreateStoreIncidentDto {
    point: string;
    businessDate: string;
    category: string;
    severity: (typeof INCIDENT_SEVERITIES)[number];
    title: string;
    description: string;
}
export declare class ResolveStoreIncidentDto {
    resolution: string;
}
export {};
