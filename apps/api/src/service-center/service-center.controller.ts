import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CreateServiceWorkOrderDto, DiagnoseServiceWorkOrderDto } from './service-center.dto';
import { ServiceCenterService } from './service-center.service';

@ApiTags('service-center')
@ApiBearerAuth()
@Controller('service-center')
@UseGuards(JwtAuthGuard)
export class ServiceCenterController {
  constructor(private readonly serviceCenter: ServiceCenterService) {}

  @Get('queue')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('warranty', 'read')
  queue() { return this.serviceCenter.queue(); }

  @Post('work-orders')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('warranty', 'transition')
  create(
    @CurrentUser() user: AuthPrincipal,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateServiceWorkOrderDto,
  ) { return this.serviceCenter.create(dto, user.customerId, key); }

  @Post('work-orders/:id/diagnose')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('warranty', 'transition')
  diagnose(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: DiagnoseServiceWorkOrderDto,
  ) { return this.serviceCenter.diagnose(id, dto, user.customerId, key); }

  @Get('me/work-orders')
  mine(@CurrentUser() user: AuthPrincipal) {
    if (user.typ !== 'customer') throw new ForbiddenException('Доступно только клиенту');
    return this.serviceCenter.mine(user.customerId);
  }

  @Post('me/work-orders/:id/approve-estimate')
  approveEstimate(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    if (user.typ !== 'customer') throw new ForbiddenException('Смету подтверждает клиент');
    return this.serviceCenter.approveEstimate(id, user.customerId, key);
  }
}
