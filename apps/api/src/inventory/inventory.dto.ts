import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransferDto {
  @ApiProperty({ example: 'IPH-15-128-UNIT-1', description: 'IMEI of the unit to move' })
  @IsString() imei!: string;

  @ApiProperty({ example: 'BISHKEK-2', description: 'Destination branch/location' })
  @IsString() to!: string;

  @ApiPropertyOptional({ example: 'дозаказ филиала' })
  @IsOptional() @IsString() reason?: string;

  @ApiPropertyOptional({ example: 'warehouse_lead' })
  @IsOptional() @IsString() requester?: string;
}

export class MovementDto {
  @ApiProperty({ example: 'clx_product_001' })
  @IsString() productId!: string;

  @ApiProperty({ minimum: 1, example: 2, description: 'Quantity affected' })
  @IsInt() @Min(1) qty!: number;

  @ApiProperty({ enum: ['write_off', 'adjust'], example: 'write_off' })
  @IsIn(['write_off', 'adjust']) type!: 'write_off' | 'adjust';

  @ApiProperty({ example: 'бой при транспортировке' })
  @IsString() reason!: string;

  @ApiPropertyOptional({ example: 'warehouse_lead' })
  @IsOptional() @IsString() requester?: string;
}
