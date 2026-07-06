import { IsString, Length, Matches } from 'class-validator';

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
  @IsString()
  refreshToken!: string;
}
