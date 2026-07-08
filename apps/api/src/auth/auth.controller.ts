import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  AppleSocialLoginDto,
  RefreshDto,
  RequestOtpDto,
  TelegramSocialLoginDto,
  VerifyOtpDto,
} from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthPrincipal } from './jwt.strategy';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Request a login OTP. Tight limit — anti SMS-bomb / cost abuse. */
  @Post('otp/request')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.phone);
  }

  /** Verify the OTP → access + refresh tokens. Capped to slow brute-forcing. */
  @Post('otp/verify')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.code);
  }

  /** Request an account recovery OTP. Same SMS channel, separate product intent. */
  @Post('recovery/request')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  requestRecovery(@Body() dto: RequestOtpDto) {
    return this.auth.requestRecoveryOtp(dto.phone);
  }

  /** Verify recovery OTP, revoke old refresh sessions, issue fresh tokens. */
  @Post('recovery/verify')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyRecovery(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyRecoveryOtp(dto.phone, dto.code);
  }

  /** Telegram Mini App/Login Widget auth → access + refresh tokens. */
  @Post('social/telegram')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  telegramSocialLogin(@Body() dto: TelegramSocialLoginDto) {
    return this.auth.loginWithTelegram(dto);
  }

  /** Sign in with Apple identity token → access + refresh tokens. */
  @Post('social/apple')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  appleSocialLogin(@Body() dto: AppleSocialLoginDto) {
    return this.auth.loginWithApple(dto);
  }

  /** Rotate the refresh token → a fresh access + refresh pair. */
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  /** Revoke a refresh token (logout). */
  @Post('logout')
  @HttpCode(204)
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  /** The current authenticated principal (guarded — proves the JWT pipeline). */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthPrincipal) {
    return user;
  }
}
