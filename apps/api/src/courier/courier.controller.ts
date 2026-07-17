import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CourierService } from './courier.service';
import { CompleteDeliveryDto, CreateRunDto, HandoverDto, RemoveFromRunDto } from './courier.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';

@ApiTags('courier')
@ApiBearerAuth()
@Controller('courier')
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
export class CourierController {
  constructor(private readonly courier: CourierService) {}

  @ApiOperation({ summary: 'Get a courier run' })
  @ApiParam({ name: 'id', description: 'Courier run id' })
  @ApiOkResponse({ description: 'Run found.' })
  @ApiNotFoundResponse({ description: 'Run does not exist.' })
  @Get('runs/:id')
  @RequirePermission('courier', 'read')
  async getRun(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    const run = await this.courier.getRun(id, user.role === 'courier' ? user.customerId : undefined);
    if (!run) throw new NotFoundException(`Курьерский рейс ${id} не найден`);
    return run;
  }

  @ApiOperation({ summary: 'Assign a courier run with its COD total (delivery.assigned)' })
  @ApiCreatedResponse({ description: 'Run created.' })
  @Post('runs')
  @RequirePermission('courier', 'assign')
  createRun(
    @CurrentUser() user: AuthPrincipal,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateRunDto,
  ) {
    return this.courier.createRun(dto, user.customerId, requireIdempotencyKey(key));
  }

  @ApiOperation({ summary: 'Assigned deliveries for the active courier JWT' })
  @ApiOkResponse({ description: 'Only deliveries assigned to the current courier.' })
  @Get('me/deliveries')
  @RequirePermission('courier', 'read')
  listMine(@CurrentUser() user: AuthPrincipal) {
    return this.courier.listMine(user.customerId);
  }

  @ApiOperation({ summary: 'Start an assigned delivery' })
  @Post('orders/:id/start')
  @RequirePermission('orders', 'transition')
  start(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.courier.startDelivery(id, user.customerId, requireIdempotencyKey(key));
  }

  @ApiOperation({ summary: 'Complete delivery and record server-reconciled COD' })
  @Post('orders/:id/deliver')
  @RequirePermission('orders', 'transition')
  deliver(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CompleteDeliveryDto,
  ) {
    return this.courier.completeDelivery(id, dto, user.customerId, requireIdempotencyKey(key));
  }

  @ApiOperation({ summary: 'Remove an undelivered order from its courier run (delivery.unassigned)' })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiOkResponse({ description: 'Order returned to paid; run COD recalculated.' })
  @ApiConflictResponse({ description: 'Order not removable or run already handed over.' })
  @Post('orders/:id/remove-from-run')
  @RequirePermission('delivery', 'fail')
  removeFromRun(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: RemoveFromRunDto,
  ) {
    return this.courier.removeOrderFromRun(
      id,
      dto,
      user.customerId,
      user.role === 'courier' ? user.customerId : undefined,
      requireIdempotencyKey(key),
    );
  }

  @ApiOperation({
    summary: 'Courier hands over collected COD with reconciliation (cash.handover)',
  })
  @ApiOkResponse({ description: 'COD reconciled; run marked handed over.' })
  @ApiConflictResponse({ description: 'COD already handed over.' })
  @ApiUnprocessableEntityResponse({
    description: 'Unknown run, or a discrepancy with no reason (invariant #4).',
  })
  @Post('handover')
  @RequirePermission('courier', 'handover')
  handover(
    @CurrentUser() user: AuthPrincipal,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: HandoverDto,
  ) {
    return this.courier.handover(
      dto,
      user.customerId,
      user.role === 'courier' ? user.customerId : undefined,
      requireIdempotencyKey(key),
    );
  }
}

function requireIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key) throw new BadRequestException('Idempotency-Key обязателен');
  if (key.length > 128) throw new BadRequestException('Idempotency-Key слишком длинный');
  return key;
}
