import { IsEmail, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import type { TelegramAuthSource } from './social-login';
import { PHONE_INPUT_PATTERN } from './phone-normalization';

export class RequestOtpDto {
  @IsString()
  @Matches(PHONE_INPUT_PATTERN, { message: 'phone must be 9–15 digits, optional +, no leading zero' })
  phone!: string;
}

export class VerifyOtpDto {
  @IsString()
  @Matches(PHONE_INPUT_PATTERN)
  phone!: string;

  @IsString()
  @Length(6, 6, { message: 'code must be 6 digits' })
  @Matches(/^\d{6}$/u, { message: 'code must be 6 digits' })
  code!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  challengeId?: string;
}

export class RequestEmailOtpDto {
  @IsEmail()
  email!: string;
}

export class VerifyEmailOtpDto extends RequestEmailOtpDto {
  @IsString()
  @Length(6, 6, { message: 'code must be 6 digits' })
  @Matches(/^\d{6}$/u, { message: 'code must be 6 digits' })
  code!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  challengeId?: string;
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

export class CompleteSocialEnrollmentDto extends VerifyOtpDto {
  @IsString()
  @Length(32, 256)
  enrollmentToken!: string;
}
