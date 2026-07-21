import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import type { TelegramAuthSource } from './social-login';

const PHONE = /^\+?\d{9,15}$/;

export class RequestOtpDto {
  @IsString()
  @Matches(PHONE, { message: 'phone must be 9-15 digits, optional leading +' })
  phone!: string;
}

export class VerifyOtpDto {
  @IsString()
  @Matches(PHONE)
  phone!: string;

  @IsString()
  @Length(6, 6, { message: 'code must be 6 digits' })
  code!: string;
}

export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken!: string;
}

export class TelegramSocialLoginDto {
  @IsString()
  initData!: string;

  @IsOptional()
  @IsIn(['mini_app', 'login_widget'])
  source?: TelegramAuthSource;
}

export class AppleSocialLoginDto {
  @IsString()
  identityToken!: string;

  @IsOptional()
  @IsString()
  nonce?: string;

  @IsOptional()
  @IsString()
  name?: string;
}
