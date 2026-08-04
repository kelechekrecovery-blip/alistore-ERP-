import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { BlindCashReadGuard } from '../auth/blind-cash-read.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';

export function AiReadGuard() {
  return applyDecorators(
    ApiBearerAuth(),
    UseGuards(JwtAuthGuard, ActiveStaffGuard, BlindCashReadGuard, PermissionGuard),
    RequirePermission('ai', 'read'),
  );
}
