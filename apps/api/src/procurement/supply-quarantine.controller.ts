import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { ValidationError } from '../common/errors';
import { ProposeSupplyQuarantineDto, ResolveSupplyQuarantineDto } from './supply-quarantine.dto';
import { SupplyQuarantineService } from './supply-quarantine.service';

@ApiTags('procurement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller('procurement/supply-quarantines')
export class SupplyQuarantineController {
  constructor(private readonly quarantines: SupplyQuarantineService) {}

  @Post('order-items/:orderItemId')
  @RequirePermission('procurement', 'receive')
  propose(
    @CurrentUser() user: AuthPrincipal,
    @Param('orderItemId') orderItemId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ProposeSupplyQuarantineDto,
  ) {
    return this.quarantines.propose(orderItemId, dto, user.customerId, requiredIdempotencyKey(idempotencyKey));
  }

  @Post(':id/resolve')
  @RequirePermission('supply_quarantine', 'resolve')
  resolve(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ResolveSupplyQuarantineDto,
  ) {
    return this.quarantines.resolve(
      id,
      dto,
      user.customerId,
      user.role,
      requiredIdempotencyKey(idempotencyKey),
    );
  }
}

function requiredIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 128) {
    throw new ValidationError(
      'idempotency_key_required',
      'Требуется заголовок Idempotency-Key длиной до 128 символов',
    );
  }
  return normalized;
}
