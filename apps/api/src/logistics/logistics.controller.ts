import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CreateDeliverySlotDto, CreateDeliveryZoneDto, LogisticsDateQueryDto } from './logistics.dto';
import { LogisticsService } from './logistics.service';

@ApiTags('logistics')
@Controller('logistics')
export class LogisticsPublicController {
  constructor(private readonly logistics: LogisticsService) {}
  @Get('availability') availability(@Query() query: LogisticsDateQueryDto) { return this.logistics.availability(query.date, query.zoneId); }
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
}
