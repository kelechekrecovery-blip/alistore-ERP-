import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const RMA_TARGETS = [
  'shipped',
  'accepted',
  'repaired',
  'replaced',
  'refunded',
  'rejected',
  'closed',
] as const;

export class CreateSupplierDto {
  @ApiProperty({ example: 'TechDistribution KG' })
  @IsString() name!: string;

  @ApiPropertyOptional({ example: '+996700000000' })
  @IsOptional() @IsString() contact?: string;
}

export class OpenRmaDto {
  @ApiProperty({ example: 'clx_supplier_001' })
  @IsString() supplierId!: string;

  @ApiProperty({ example: 'IPH-15-128-UNIT-3', description: 'IMEI of the defective unit' })
  @IsString() imei!: string;

  @ApiProperty({ example: 'не включается из коробки' })
  @IsString() defect!: string;

  @ApiPropertyOptional({ example: 'warehouse_lead' })
  @IsOptional() @IsString() actor?: string;
}

export class RmaTransitionDto {
  @ApiProperty({ enum: RMA_TARGETS, example: 'shipped' })
  @IsIn(RMA_TARGETS as unknown as string[]) to!: (typeof RMA_TARGETS)[number];

  @ApiPropertyOptional({ example: 'warehouse_lead' })
  @IsOptional() @IsString() actor?: string;
}
