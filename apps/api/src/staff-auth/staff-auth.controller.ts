import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { StaffUser } from '@prisma/client';
import { StaffAuthService } from './staff-auth.service';
import { CreateStaffDto, StaffLoginDto, StaffTotpTokenDto } from './staff-auth.dto';
import { RefreshDto } from '../auth/auth.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import {
  clearStaffSessionCookies,
  isStaffWebSessionRequest,
  readWebCookie,
  setStaffSessionCookies,
  STAFF_REFRESH_COOKIE,
} from '../auth/web-session';

@Controller('staff-auth')
export class StaffAuthController {
  constructor(private readonly staffAuth: StaffAuthService) {}

  /** One-time bootstrap of the first owner (only when no staff exist yet). */
  @Post('bootstrap')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async bootstrap(@Body() dto: StaffLoginDto) {
    return this.publicView(
      await this.staffAuth.bootstrapOwner(dto.username, dto.password),
    );
  }

  /** Staff login → { accessToken, role }. */
  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // anti brute-force on staff passwords
  async login(@Body() dto: StaffLoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.staffAuth.login(dto.username, dto.password);
    if (isStaffWebSessionRequest(request)) setStaffSessionCookies(response, tokens, process.env.NODE_ENV === 'production');
    if (isStaffWebSessionRequest(request)) {
      const { refreshToken: _refreshToken, ...safe } = tokens;
      return safe;
    }
    return tokens;
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = dto.refreshToken?.trim() || readWebCookie(request, STAFF_REFRESH_COOKIE);
    const tokens = await this.staffAuth.refresh(refreshToken ?? '');
    if (isStaffWebSessionRequest(request)) setStaffSessionCookies(response, tokens, process.env.NODE_ENV === 'production');
    if (isStaffWebSessionRequest(request)) {
      const { refreshToken: _refreshToken, ...safe } = tokens;
      return safe;
    }
    return tokens;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = dto.refreshToken?.trim() || readWebCookie(request, STAFF_REFRESH_COOKIE);
    if (refreshToken) await this.staffAuth.logout(refreshToken);
    if (isStaffWebSessionRequest(request)) clearStaffSessionCookies(response, process.env.NODE_ENV === 'production');
  }

  /**
   * Create a staff account — owner only (casbin guard, role from the JWT).
   *
   * `ActiveStaffGuard` здесь обязателен и был пропущен: staff-токен живёт 8 часов
   * и не отзывается, поэтому без него уволенный владелец до конца этого окна
   * заводил себе новую учётку owner — а она переживает даже ротацию JWT_SECRET.
   * Соседние `staff/:id/totp-reset` и `staff/:id/deactivate` guard имели.
   * Покрыто STAFF-003 в `test/access-staff-batch.e2e-spec.ts`.
   */
  @Post('staff')
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('staff', 'manage')
  async createStaff(@Body() dto: CreateStaffDto) {
    return this.publicView(
      await this.staffAuth.createStaff(dto.username, dto.password, dto.role, dto.point),
    );
  }

  /** The current staff principal. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthPrincipal) {
    this.assertStaff(user);
    return { ...(await this.staffAuth.me(user.customerId)), typ: user.typ };
  }

  /** Create/replace a pending TOTP secret for the current staff account. */
  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  setupTotp(@CurrentUser() user: AuthPrincipal) {
    this.assertStaff(user);
    return this.staffAuth.setupTotp(user.customerId);
  }

  /** Enable 2FA after verifying the authenticator code. */
  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  enableTotp(@CurrentUser() user: AuthPrincipal, @Body() dto: StaffTotpTokenDto) {
    this.assertStaff(user);
    return this.staffAuth.enableTotp(user.customerId, dto.token);
  }

  /** Disable self 2FA after a valid current code. */
  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  disableTotp(@CurrentUser() user: AuthPrincipal, @Body() dto: StaffTotpTokenDto) {
    this.assertStaff(user);
    return this.staffAuth.disableTotp(user.customerId, dto.token);
  }

  /**
   * STAFF-002: reset a staff member's 2FA without the current code (lost authenticator).
   * Owner-only via `staff:manage`; writes `staff.totp_reset` to the ledger.
   */
  @Post('staff/:id/totp-reset')
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('staff', 'manage')
  resetTotp(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.staffAuth.resetTotpByAdmin(user.customerId, id);
  }

  /**
   * STAFF-001: deactivate a staff account. Open cash shifts and active courier
   * deliveries block with 409; otherwise the account is cut off immediately and
   * `staff.deactivated` lands in the ledger. Re-deactivation is idempotent.
   */
  @Post('staff/:id/deactivate')
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('staff', 'manage')
  deactivate(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.staffAuth.deactivateStaff(user.customerId, id);
  }

  /** Never expose the password hash. */
  private publicView(staff: StaffUser) {
    return this.staffAuth.publicView(staff);
  }

  private assertStaff(user: AuthPrincipal) {
    if (user.typ !== 'staff' || !user.role) {
      throw new ForbiddenException('Требуется staff JWT');
    }
  }
}
