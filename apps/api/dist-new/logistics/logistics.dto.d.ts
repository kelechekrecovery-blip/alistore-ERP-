export declare class CreateDeliveryZoneDto {
    code: string;
    name: string;
    fee: number;
    etaMinMinutes: number;
    etaMaxMinutes: number;
    active?: boolean;
}
export declare class CreateDeliverySlotDto {
    zoneId: string;
    startsAt: string;
    endsAt: string;
    capacity: number;
}
export declare class LogisticsDateQueryDto {
    date?: string;
    zoneId?: string;
}
export declare class CreateStorePointDto {
    code: string;
    name: string;
    address: string;
    inventoryLocation: string;
    hours: string;
    pickupInstructions?: string;
    active?: boolean;
    sortOrder?: number;
}
export declare class UpdateStorePointDto {
    name?: string;
    address?: string;
    hours?: string;
    pickupInstructions?: string;
    active?: boolean;
    sortOrder?: number;
}
