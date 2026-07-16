import { BadRequestException, Body, Controller, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiAcceptedResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ExchangesService } from './exchanges.service';
import { ExchangeDto } from './exchanges.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';

@ApiTags('exchanges')
@Controller('exchanges')
export class ExchangesController {
  constructor(private readonly exchanges: ExchangesService) {}

  @ApiOperation({ summary: 'Park an exact exchange snapshot for evidence and senior approval' })
  @ApiAcceptedResponse({ description: 'Exchange request created; no money or stock changed.' })
  @ApiConflictResponse({ description: 'Old unit not sold, or no stock for the new device.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown order/item/product, or cheaper exchange.' })
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('exchanges', 'create')
  exchange(
    @CurrentUser() user: AuthPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ExchangeDto,
  ) {
    const key = idempotencyKey?.trim();
    if (!key) throw new BadRequestException('Idempotency-Key обязателен');
    if (key.length > 128) throw new BadRequestException('Idempotency-Key слишком длинный');
    return this.exchanges.request(dto, user.customerId, key);
  }
}
