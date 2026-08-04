import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CreateDeliverySlotDto, CreateDeliveryZoneDto, CreateStorePointDto, LogisticsDateQueryDto, UpdateStorePointDto } from './logistics.dto';
import { LogisticsService } from './logistics.service';

@ApiTags('logistics')
@Controller('logistics')
export class LogisticsPublicController {
  constructor(private readonly logistics: LogisticsService) {}
  @Get('availability') availability(@Query() query: LogisticsDateQueryDto) { return this.logistics.availability(query.date, query.zoneId); }
  @Get('checkout-options') checkoutOptions(@Query() query: LogisticsDateQueryDto) { return this.logistics.checkoutOptions(query.date); }
}

@ApiTags('logistics')
@ApiBearerAuth()
@Controller('logistics')
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
export class LogisticsController {
  constructor(private readonly logistics: LogisticsService) {}

  @Get('overview') @RequirePermission('logistics', 'read')
  overview(@Query() query: LogisticsDateQueryDto) { return this.logistics.overview(query.date); }

  @Post('zones') @RequirePermission('logistics', 'manage')
  createZone(@CurrentUser() user: AuthPrincipal, @Headers('idempotency-key') key: string | undefined, @Body() dto: CreateDeliveryZoneDto) { return this.logistics.createZone(dto, user.customerId, key); }

  @Post('slots') @RequirePermission('logistics', 'manage')
  createSlot(@CurrentUser() user: AuthPrincipal, @Headers('idempotency-key') key: string | undefined, @Body() dto: CreateDeliverySlotDto) { return this.logistics.createSlot(dto, user.customerId, key); }

  @Post('store-points') @RequirePermission('logistics', 'manage')
  createStorePoint(@CurrentUser() user: AuthPrincipal, @Headers('idempotency-key') key: string | undefined, @Body() dto: CreateStorePointDto) { return this.logistics.createStorePoint(dto, user.customerId, key); }

  @Patch('store-points/:id') @RequirePermission('logistics', 'manage')
  updateStorePoint(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() dto: UpdateStorePointDto) { return this.logistics.updateStorePoint(id, dto, user.customerId, key); }
}
