import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export const EVIDENCE_ENTITY_TYPES = [
  'tradein',
  'return',
  'warranty',
  'inventory',
  'order',
  'support',
  'shift',
] as const;

export type EvidenceEntityType = (typeof EVIDENCE_ENTITY_TYPES)[number];

export class EvidenceImageDto {
  @ApiProperty({ enum: EVIDENCE_ENTITY_TYPES, example: 'tradein' })
  @IsIn(EVIDENCE_ENTITY_TYPES)
  entityType!: EvidenceEntityType;

  @ApiProperty({ example: 'clx_entity_001' })
  @IsString()
  entityId!: string;

  @ApiPropertyOptional({ example: 'device_front' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ example: 'customer_app' })
  @IsOptional()
  @IsString()
  actor?: string;
}
