import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { AssignServiceTechnicianDto, CompleteServiceRepairDto, CreatePaidRepairDto, CreateServiceWorkOrderDto, DiagnoseServiceWorkOrderDto, PayServiceWorkOrderDto, ReplaceServiceDeviceDto, ReserveServicePartDto } from './service-center.dto';
import { ServiceCenterService } from './service-center.service';
import { ServiceExecutionService } from './service-execution.service';

@ApiTags('service-center')
@ApiBearerAuth()
@Controller('service-center')
@UseGuards(JwtAuthGuard)
export class ServiceCenterController {
  constructor(
    private readonly serviceCenter: ServiceCenterService,
    private readonly execution: ServiceExecutionService,
  ) {}

  @Get('queue')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('service_center', 'read')
  queue(@CurrentUser() user: AuthPrincipal) { return this.serviceCenter.queue(user.customerId); }

  @Post('work-orders')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('service_center', 'intake')
  create(
    @CurrentUser() user: AuthPrincipal,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateServiceWorkOrderDto,
  ) { return this.serviceCenter.create(dto, user.customerId, key); }

  @Post('paid-repairs')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('service_center', 'intake')
  createPaidRepair(
    @CurrentUser() user: AuthPrincipal,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreatePaidRepairDto,
  ) { return this.serviceCenter.createPaidRepair(dto, user.customerId, key); }

  @Post('work-orders/:id/assign')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('service_center', 'assign')
  assign(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: AssignServiceTechnicianDto,
  ) { return this.serviceCenter.assign(id, dto, user.customerId, key); }

  @Post('work-orders/:id/diagnose')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('service_center', 'diagnose')
  diagnose(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: DiagnoseServiceWorkOrderDto,
  ) { return this.serviceCenter.diagnose(id, dto, user.customerId, key); }

  @Post('work-orders/:id/parts')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('service_center', 'parts')
  reservePart(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: ReserveServicePartDto,
  ) { return this.execution.reservePart(id, dto, user.customerId, key); }

  @Post('work-orders/:id/parts/:partId/release')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('service_center', 'parts')
  releasePart(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Param('partId') partId: string,
    @Headers('idempotency-key') key: string | undefined,
  ) { return this.execution.releasePart(id, partId, user.customerId, key); }

  @Post('work-orders/:id/parts/:partId/consume')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('service_center', 'execute')
  consumePart(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Param('partId') partId: string,
    @Headers('idempotency-key') key: string | undefined,
  ) { return this.execution.consumePart(id, partId, user.customerId, key); }

  @Post('work-orders/:id/start')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('service_center', 'execute')
  start(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) { return this.execution.start(id, user.customerId, key); }

  @Post('work-orders/:id/complete')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('service_center', 'execute')
  complete(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CompleteServiceRepairDto,
  ) { return this.execution.complete(id, dto, user.customerId, key); }

  @Post('work-orders/:id/replace')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('service_center', 'execute')
  replace(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: ReplaceServiceDeviceDto,
  ) { return this.execution.replace(id, dto, user.customerId, key); }

  @Post('work-orders/:id/close')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('service_center', 'execute')
  close(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) { return this.execution.close(id, user.customerId, key); }

  @Get('work-orders/:id/payment-context')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('payments', 'take_service')
  paymentContext(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.serviceCenter.paymentContext(id, user.customerId);
  }

  @Post('work-orders/:id/pay')
  @UseGuards(ActiveStaffGuard, PermissionGuard)
  @RequirePermission('payments', 'take_service')
  pay(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: PayServiceWorkOrderDto,
  ) { return this.serviceCenter.pay(id, dto, user.customerId, key); }

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
