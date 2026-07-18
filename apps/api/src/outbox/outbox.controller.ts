import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { requireActiveStaff } from '../auth/staff-principal';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { OutboxService } from './outbox.service';

/** Operator surface for the transactional outbox (owner/admin). */
@ApiTags('outbox')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller('outbox')
export class OutboxController {
  constructor(
    private readonly outbox: OutboxService,
    private readonly staffAuth: StaffAuthService,
  ) {}

  @Post(':id/redrive')
  @HttpCode(200)
  @RequirePermission('outbox', 'manage')
  @ApiOperation({ summary: 'Re-drive a failed outbox message: reset attempts and return it to the pending queue (owner/admin)' })
  async redrive(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    const actor = await requireActiveStaff(user, this.staffAuth);
    return this.outbox.redrive(id, actor);
  }
}
