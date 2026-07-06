import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DecideApprovalDto {
  @ApiProperty({ enum: ['approved', 'rejected'], example: 'approved' })
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected';

  @ApiProperty({ example: 'admin_gulnara' })
  @IsString()
  approver!: string;

  @ApiPropertyOptional({ example: 'проверил акт возврата' })
  @IsOptional()
  @IsString()
  reason?: string;
}
