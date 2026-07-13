import { BadRequestException, Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CourierService } from './courier.service';
import { FailDeliveryDto } from './courier.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';

@ApiTags('deliveries')
@ApiBearerAuth()
@Controller('deliveries')
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
export class DeliveriesController {
  constructor(private readonly courier: CourierService) {}

  @ApiOperation({ summary: 'Record a failed delivery with evidence (delivery.failed)' })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiOkResponse({ description: 'Failure recorded in the ledger.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown order.' })
  @Post(':id/fail')
  @RequirePermission('delivery', 'fail')
  fail(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: FailDeliveryDto,
  ) {
    const key = idempotencyKey?.trim();
    if (!key) throw new BadRequestException('Idempotency-Key обязателен');
    if (key.length > 128) throw new BadRequestException('Idempotency-Key слишком длинный');
    return this.courier.failDelivery(id, dto, user.customerId, key);
  }
}
