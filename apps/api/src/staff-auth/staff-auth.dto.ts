import { Role } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class StaffLoginDto {
  @IsString() @IsNotEmpty() username!: string;
  @IsString() @IsNotEmpty() password!: string;
}

export class CreateStaffDto {
  @IsString() @IsNotEmpty() username!: string;
  @IsString() @IsNotEmpty() password!: string;
  @IsEnum(Role) role!: Role;
  @IsString() @IsNotEmpty() @MaxLength(80) point!: string;
}

export class StaffTotpTokenDto {
  @IsString() @IsNotEmpty() token!: string;
}
