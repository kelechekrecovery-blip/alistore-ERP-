import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { StaffUser } from '@prisma/client';
import { StaffAuthService } from './staff-auth.service';
import { CreateStaffDto, StaffLoginDto, StaffTotpTokenDto } from './staff-auth.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';

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
  login(@Body() dto: StaffLoginDto) {
    return this.staffAuth.login(dto.username, dto.password);
  }

  /** Create a staff account — owner only (casbin guard, role from the JWT). */
  @Post('staff')
  @UseGuards(JwtAuthGuard, PermissionGuard)
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
