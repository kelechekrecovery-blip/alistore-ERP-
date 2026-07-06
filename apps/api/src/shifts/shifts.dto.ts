import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OpenShiftDto {
  @ApiProperty({ example: 'staff_seller_01' })
  @IsString() staffId!: string;

  @ApiProperty({ example: 'BISHKEK-1', description: 'Point of sale / branch code' })
  @IsString() point!: string;

  @ApiProperty({ minimum: 0, example: 5000, description: 'Opening cash in the drawer (сом)' })
  @IsInt() @Min(0) openCash!: number;
}

export class CloseShiftDto {
  @ApiProperty({ minimum: 0, example: 154900, description: 'Counted cash in the drawer at close' })
  @IsInt() @Min(0) closeCash!: number;

  /** Required when the drawer does not reconcile (diff ≠ 0) — invariant #3. */
  @ApiPropertyOptional({
    description: 'Reason for a cash discrepancy. Mandatory when closeCash ≠ expected.',
    example: 'сдача выдана без чека',
  })
  @IsOptional() @IsString() reason?: string;
}
