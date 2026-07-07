import { ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CountDto {
  @ApiProperty({ example: 'clx_product_001' })
  @IsString() productId!: string;

  @ApiProperty({ example: 'BISHKEK-1', description: 'Location being counted' })
  @IsString() location!: string;

  @ApiProperty({ minimum: 0, example: 7, description: 'Physically counted quantity' })
  @IsInt() @Min(0) counted!: number;

  @ApiPropertyOptional({ example: 'warehouse_lead' })
  @IsOptional() @IsString() requester?: string;
}

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

export class ReceiveDto {
  @ApiProperty({ example: 'clx_product_001' })
  @IsString() productId!: string;

  @ApiProperty({ example: 'BISHKEK-1', description: 'Receiving branch/location' })
  @IsString() location!: string;

  @ApiProperty({ type: [String], example: ['IPH-15-128-UNIT-3', 'IPH-15-128-UNIT-4'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  imeis!: string[];

  @ApiPropertyOptional({ enum: ['A', 'B', 'C'], example: 'A' })
  @IsOptional()
  @IsIn(['A', 'B', 'C'])
  grade?: 'A' | 'B' | 'C';

  @ApiPropertyOptional({ example: 'поставка #INV-001' })
  @IsOptional() @IsString() reason?: string;
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
