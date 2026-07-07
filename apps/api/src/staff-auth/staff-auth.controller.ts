import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { StaffUser } from '@prisma/client';
import { StaffAuthService } from './staff-auth.service';
import { CreateStaffDto, StaffLoginDto } from './staff-auth.dto';
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
  async bootstrap(@Body() dto: StaffLoginDto) {
    return this.publicView(
      await this.staffAuth.bootstrapOwner(dto.username, dto.password),
    );
  }

  /** Staff login → { accessToken, role }. */
  @Post('login')
  login(@Body() dto: StaffLoginDto) {
    return this.staffAuth.login(dto.username, dto.password);
  }

  /** Create a staff account — owner only (casbin guard, role from the JWT). */
  @Post('staff')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('staff', 'manage')
  async createStaff(@Body() dto: CreateStaffDto) {
    return this.publicView(
      await this.staffAuth.createStaff(dto.username, dto.password, dto.role),
    );
  }

  /** The current staff principal. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthPrincipal) {
    return { staffId: user.customerId, role: user.role, typ: user.typ };
  }

  /** Never expose the password hash. */
  private publicView(staff: StaffUser) {
    return {
      id: staff.id,
      username: staff.username,
      role: staff.role,
      active: staff.active,
    };
  }
}
