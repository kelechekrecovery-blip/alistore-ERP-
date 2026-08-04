import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SetSettingDto } from './settings.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthPrincipal } from '../auth/jwt.strategy';

/**
 * Owner-editable business parameters. Reading is owner/admin (`reports:read`);
 * writing needs `settings:manage`, which only the owner holds — these values move
 * money (payroll, discount ceilings, buyback spread), so they sit at the same
 * height as staff management rather than with ordinary content editing.
 */
@Controller('settings')
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermission('reports', 'read')
  list() {
    return this.settings.list();
  }

  @Patch(':key')
  @RequirePermission('settings', 'manage')
  set(@CurrentUser() user: AuthPrincipal, @Param('key') key: string, @Body() dto: SetSettingDto) {
    return this.settings.set(key, dto.value, user.customerId);
  }
}
