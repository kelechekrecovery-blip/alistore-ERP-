import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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

  @ApiOperation({
    summary: 'Exchange a device: return old + sell new + collect surcharge (atomic)',
  })
  @ApiCreatedResponse({ description: 'Exchange completed; new paid order + ledger trail.' })
  @ApiConflictResponse({ description: 'Old unit not sold, or no stock for the new device.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown order/item/product, or cheaper exchange.' })
  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('exchanges', 'create')
  exchange(@CurrentUser() user: AuthPrincipal, @Body() dto: ExchangeDto) {
    return this.exchanges.exchange(dto, user.customerId);
  }
}
