import { Role } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class StaffLoginDto {
  @IsString() @IsNotEmpty() username!: string;
  @IsString() @IsNotEmpty() password!: string;

  /**
   * Код 2FA. Необязателен в схеме, но обязателен по факту для учётки с
   * включённой 2FA — иначе `login` вернёт 401 `totp_required`. Необязательным
   * оставлен намеренно: контракт входа для учёток без 2FA не меняется, а
   * POS-офлайн-клиент мог закэшировать старую схему.
   */
  @IsOptional() @IsString() @MaxLength(16) totp?: string;
}

/**
 * Создание первого владельца — публичный маршрут. Пароль «1» проходил, потому
 * что login-DTO не задаёт минимальную длину. Отдельный DTO с MinLength(8), чтобы
 * не менять контракт логина (там пароль уже существует и проверяется argon2).
 */
export class BootstrapOwnerDto {
  @IsString() @IsNotEmpty() @MaxLength(80) username!: string;
  @IsString() @MinLength(8) @MaxLength(200) password!: string;
  // Optional in the wire schema for old setup clients; StaffAuthService rejects
  // an absent point outside the test harness, so production still fails closed.
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) point?: string;
}

export class CreateStaffDto {
  @IsString() @IsNotEmpty() username!: string;
  @IsString() @IsNotEmpty() password!: string;
  @IsEnum(Role) role!: Role;
  @IsString() @IsNotEmpty() @MaxLength(80) point!: string;
}

export class ChangeStaffRoleDto {
  @IsEnum(Role) role!: Role;
}

/** Admin reset — same strength bar as bootstrap, the shopper never sets this. */
export class ResetStaffPasswordDto {
  @IsString() @MinLength(8) @MaxLength(200) password!: string;
}

export class StaffTotpTokenDto {
  @IsString() @IsNotEmpty() token!: string;
}
