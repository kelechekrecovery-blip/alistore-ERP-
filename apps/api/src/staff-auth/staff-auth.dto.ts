import { Role } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class StaffLoginDto {
  @IsString() @IsNotEmpty() username!: string;
  @IsString() @IsNotEmpty() password!: string;
}

export class CreateStaffDto {
  @IsString() @IsNotEmpty() username!: string;
  @IsString() @IsNotEmpty() password!: string;
  @IsEnum(Role) role!: Role;
}

export class StaffTotpTokenDto {
  @IsString() @IsNotEmpty() token!: string;
}
