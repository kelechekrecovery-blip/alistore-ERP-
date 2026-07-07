import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { Role } from '../rbac/permissions';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DecideApprovalDto {
  @ApiProperty({ enum: ['approved', 'rejected'], example: 'approved' })
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected';

  @ApiPropertyOptional({ example: 'admin_gulnara', description: 'Deprecated: ignored when staff JWT is present.' })
  @IsOptional()
  @IsString()
  approver?: string;

  @ApiPropertyOptional({ enum: Role, example: Role.admin, description: 'Deprecated: role comes from staff JWT.' })
  @IsOptional()
  @IsEnum(Role)
  approverRole?: Role;

  @ApiPropertyOptional({ example: 'проверил акт возврата' })
  @IsOptional()
  @IsString()
  reason?: string;
}
