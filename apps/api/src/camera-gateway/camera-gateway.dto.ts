import { IsIn, IsISO8601, IsObject, IsOptional, IsString, IsNumber, Max, MaxLength, Min } from 'class-validator';

export const CAMERA_EVENT_TYPES = [
  'queue_length_estimated', 'shelf_empty_detected', 'camera_offline',
  'camera_tamper_detected', 'restricted_area_motion', 'fall_or_safety_incident',
] as const;

export class RegisterEdgeDeviceDto {
  @IsString() @MaxLength(80) name!: string;
  @IsString() @MaxLength(80) storePointId!: string;
  @IsOptional() @IsIn(['camera', 'scanner', 'scale', 'kiosk']) kind?: string;
}

export class IngestCameraEventDto {
  @IsString() @MaxLength(128) idempotencyKey!: string;
  @IsString() @MaxLength(64) deviceId!: string;
  @IsString() @MaxLength(80) storePointId!: string;
  @IsIn(CAMERA_EVENT_TYPES) eventType!: (typeof CAMERA_EVENT_TYPES)[number];
  @IsNumber() @Min(0) @Max(1) confidence!: number;
  @IsObject() value!: Record<string, unknown>;
  @IsOptional() @IsIn(['non_identifying', 'redacted']) privacyLevel?: string;
  @IsOptional() @IsString() @MaxLength(160) evidenceRef?: string;
  @IsISO8601() occurredAt!: string;
  @IsOptional() @IsNumber() @Min(1) @Max(720) retentionHours?: number;
}
