import { Role } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class StaffLoginDto {
  @IsString() @IsNotEmpty() username!: string;
  @IsString() @IsNotEmpty() password!: string;
}

/**
 * Создание первого владельца — публичный маршрут. Пароль «1» проходил, потому
 * что login-DTO не задаёт минимальную длину. Отдельный DTO с MinLength(8), чтобы
 * не менять контракт логина (там пароль уже существует и проверяется argon2).
 */
export class BootstrapOwnerDto {
  @IsString() @IsNotEmpty() @MaxLength(80) username!: string;
  @IsString() @MinLength(8) @MaxLength(200) password!: string;
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
