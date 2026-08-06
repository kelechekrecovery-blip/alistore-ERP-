export declare const CAMERA_EVENT_TYPES: readonly ["queue_length_estimated", "shelf_empty_detected", "camera_offline", "camera_tamper_detected", "restricted_area_motion", "fall_or_safety_incident"];
export declare class RegisterEdgeDeviceDto {
    name: string;
    storePointId: string;
    kind?: string;
}
export declare class IngestCameraEventDto {
    idempotencyKey: string;
    deviceId: string;
    storePointId: string;
    eventType: (typeof CAMERA_EVENT_TYPES)[number];
    confidence: number;
    value: Record<string, unknown>;
    privacyLevel?: string;
    evidenceRef?: string;
    occurredAt: string;
    retentionHours?: number;
}
