import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}

export class CreateMineReturnDto {
  @ApiProperty({ example: 'clx_order_001' })
  @IsString() orderId!: string;

  @ApiProperty({ example: 'не подошёл, возврат в 14 дней' })
  @IsString() reason!: string;
}

export class ReturnStatusDto {
  @ApiProperty({ enum: RETURN_STATUSES, example: 'under_review' })
  @IsIn(RETURN_STATUSES) status!: (typeof RETURN_STATUSES)[number];

  @ApiPropertyOptional({ example: 'BISHKEK-1', description: 'Required when status=reconciled.' })
  @IsOptional() @IsString() location?: string;
}
