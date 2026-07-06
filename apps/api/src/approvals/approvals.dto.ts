import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { Role } from '../rbac/permissions';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DecideApprovalDto {
  @ApiProperty({ enum: ['approved', 'rejected'], example: 'approved' })
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected';

  @ApiProperty({ example: 'admin_gulnara' })
  @IsString()
  approver!: string;

  @ApiProperty({ enum: Role, example: Role.admin, description: 'Approver role (Role Permission Matrix)' })
  @IsEnum(Role)
  approverRole!: Role;

  @ApiPropertyOptional({ example: 'проверил акт возврата' })
  @IsOptional()
  @IsString()
  reason?: string;
}
