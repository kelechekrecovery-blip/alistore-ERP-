import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  AppleSocialLoginDto,
  RefreshDto,
  RequestEmailOtpDto,
  RequestOtpDto,
  TelegramSocialLoginDto,
  VerifyOtpDto,
  VerifyEmailOtpDto,
} from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthPrincipal } from './jwt.strategy';
import {
  clearWebSessionCookies,
  isWebSessionRequest,
  readWebCookie,
  setWebSessionCookies,
  WEB_REFRESH_COOKIE,
  webAuthResponse,
} from './web-session';

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
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.verifyOtp(dto.phone, dto.code);
    if (isWebSessionRequest(request)) setWebSessionCookies(response, tokens, process.env.NODE_ENV === 'production');
    return webAuthResponse(request, tokens);
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
  async verifyRecovery(@Body() dto: VerifyOtpDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.verifyRecoveryOtp(dto.phone, dto.code);
    if (isWebSessionRequest(request)) setWebSessionCookies(response, tokens, process.env.NODE_ENV === 'production');
    return webAuthResponse(request, tokens);
  }

  @Post('email/request')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  requestEmailOtp(@Body() dto: RequestEmailOtpDto) {
    return this.auth.requestEmailOtp(dto.email);
  }

  @Post('email/verify')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyEmailOtp(@Body() dto: VerifyEmailOtpDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.verifyEmailOtp(dto.email, dto.code);
    if (isWebSessionRequest(request)) setWebSessionCookies(response, tokens, process.env.NODE_ENV === 'production');
    return webAuthResponse(request, tokens);
  }

  @Post('email/attach/request')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  requestEmailAttach(@CurrentUser() user: AuthPrincipal, @Body() dto: RequestEmailOtpDto) {
    if (user.typ !== 'customer') throw new ForbiddenException('Требуется customer JWT');
    return this.auth.requestEmailAttach(user.customerId, dto.email);
  }

  @Post('email/attach/confirm')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  confirmEmailAttach(@CurrentUser() user: AuthPrincipal, @Body() dto: VerifyEmailOtpDto) {
    if (user.typ !== 'customer') throw new ForbiddenException('Требуется customer JWT');
    return this.auth.confirmEmailAttach(user.customerId, dto.email, dto.code);
  }

  /** Telegram Mini App/Login Widget auth → access + refresh tokens. */
  @Post('social/telegram')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async telegramSocialLogin(@Body() dto: TelegramSocialLoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.loginWithTelegram(dto);
    if (isWebSessionRequest(request)) setWebSessionCookies(response, tokens, process.env.NODE_ENV === 'production');
    return webAuthResponse(request, tokens);
  }

  /** Sign in with Apple identity token → access + refresh tokens. */
  @Post('social/apple')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async appleSocialLogin(@Body() dto: AppleSocialLoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.loginWithApple(dto);
    if (isWebSessionRequest(request)) setWebSessionCookies(response, tokens, process.env.NODE_ENV === 'production');
    return webAuthResponse(request, tokens);
  }

  /** Rotate the refresh token → a fresh access + refresh pair. */
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = dto.refreshToken?.trim() || readWebCookie(request, WEB_REFRESH_COOKIE);
    if (!refreshToken) return this.auth.refresh('');
    const tokens = await this.auth.refresh(refreshToken);
    if (isWebSessionRequest(request)) setWebSessionCookies(response, tokens, process.env.NODE_ENV === 'production');
    return webAuthResponse(request, tokens);
  }

  /** Revoke a refresh token (logout). */
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = dto.refreshToken?.trim() || readWebCookie(request, WEB_REFRESH_COOKIE);
    if (refreshToken) await this.auth.logout(refreshToken);
    if (isWebSessionRequest(request)) clearWebSessionCookies(response, process.env.NODE_ENV === 'production');
  }

  /** The current authenticated principal (guarded — proves the JWT pipeline). */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthPrincipal) {
    return user;
  }
}
