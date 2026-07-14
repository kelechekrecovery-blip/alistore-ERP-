import { ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const RETURN_STATUSES = [
  'requested',
  'under_review',
  'approved',
  'rejected',
  'processing',
  'paid',
  'reconciled',
] as const;

export class CreateReturnDto {
  @ApiProperty({ example: 'clx_order_001' })
  @IsString() orderId!: string;

  @ApiProperty({ example: 'не подошёл, возврат в 14 дней' })
  @IsString() reason!: string;

  @ApiPropertyOptional({ example: 'customer or staff id' })
  @IsOptional() @IsString() requester?: string;

  @ApiPropertyOptional({ type: () => [ReturnSelectionDto], description: 'Omit to return the full order.' })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayUnique((item: ReturnSelectionDto) => item.orderItemId)
  @ValidateNested({ each: true }) @Type(() => ReturnSelectionDto) items?: ReturnSelectionDto[];
}

export class CreateMineReturnDto {
  @ApiProperty({ example: 'clx_order_001' })
  @IsString() orderId!: string;

  @ApiProperty({ example: 'не подошёл, возврат в 14 дней' })
  @IsString() reason!: string;

  @ApiPropertyOptional({ type: () => [ReturnSelectionDto], description: 'Omit to return the full order.' })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayUnique((item: ReturnSelectionDto) => item.orderItemId)
  @ValidateNested({ each: true }) @Type(() => ReturnSelectionDto) items?: ReturnSelectionDto[];
}

export class ReturnSelectionDto {
  @ApiProperty({ example: 'clx_order_item_001' })
  @IsString() orderItemId!: string;

  @ApiProperty({ minimum: 1, example: 1 })
  @IsInt() @Min(1) qty!: number;
}

export class ReturnStatusDto {
  @ApiProperty({ enum: RETURN_STATUSES, example: 'under_review' })
  @IsIn(RETURN_STATUSES) status!: (typeof RETURN_STATUSES)[number];

  @ApiPropertyOptional({ example: 'BISHKEK-1', description: 'Required when status=reconciled.' })
  @IsOptional() @IsString() location?: string;
}
