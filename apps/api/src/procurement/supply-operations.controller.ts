import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { SupplyOperationsService } from './supply-operations.service';

@ApiTags('procurement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller('procurement/supply-operations')
export class SupplyOperationsController {
  constructor(private readonly operations: SupplyOperationsService) {}

  @Get()
  @RequirePermission('procurement', 'read')
  @ApiOperation({ summary: 'Read role-filtered operational queues for customer supply orders' })
  list(@CurrentUser() user: AuthPrincipal) {
    return this.operations.list(user.role);
  }
}
