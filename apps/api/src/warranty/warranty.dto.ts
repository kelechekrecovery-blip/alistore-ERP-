import { IsIn, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const STATUSES = [
  'created', 'received', 'diagnostics', 'waiting_supplier',
  'approved', 'rejected', 'repaired', 'replaced', 'closed',
] as const;

export class OpenWarrantyDto {
  @ApiProperty({ example: 'IPH-15-128-UNIT-1' })
  @IsString() imei!: string;

  @ApiProperty({ example: 'clx_customer_001' })
  @IsString() customerId!: string;

  @ApiProperty({ example: 'не держит зарядку' })
  @IsString() @MaxLength(500) problem!: string;
}

export class WarrantyStatusDto {
  @ApiProperty({ enum: STATUSES, example: 'diagnostics' })
  @IsIn(STATUSES) status!: (typeof STATUSES)[number];
}
