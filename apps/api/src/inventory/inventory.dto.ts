import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
