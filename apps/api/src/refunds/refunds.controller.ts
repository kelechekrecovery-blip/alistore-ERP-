import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { requireActiveStaff } from '../auth/staff-principal';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { CancelRefundDto, CreateRefundDto, ResolveRefundDto } from './refunds.dto';
import { RefundProcessor } from './refunds.processor';
import { RefundsService } from './refunds.service';

@ApiTags('refunds')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller()
export class RefundsController {
  constructor(
    private readonly refunds: RefundsService,
    private readonly processor: RefundProcessor,
    private readonly staffAuth: StaffAuthService,
  ) {}

  @Post('returns/:returnId/refunds')
  @HttpCode(202)
  @RequirePermission('payments', 'refund')
  @ApiOperation({ summary: 'Create an idempotent, approval-gated refund for a Return' })
  async create(
    @CurrentUser() user: AuthPrincipal,
    @Param('returnId') returnId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateRefundDto,
  ) {
    const actor = await requireActiveStaff(user, this.staffAuth);
    return this.refunds.request(returnId, dto, actor, requireIdempotencyKey(idempotencyKey));
  }

  @Get('refunds/:id')
  @RequirePermission('refunds', 'read')
  get(@Param('id') id: string) {
    return this.refunds.get(id);
  }

  @Post('refunds/:id/retry')
  @RequirePermission('refunds', 'retry')
  @ApiOperation({ summary: 'Retry queued or failed refund allocations safely' })
  async retry(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    const actor = await requireActiveStaff(user, this.staffAuth);
    await this.processor.processRefund(id, actor);
    return this.refunds.get(id);
  }

  @Post('refunds/:id/cancel')
  @RequirePermission('refunds', 'manage')
  @ApiOperation({ summary: 'Cancel an unexecuted failed refund after provider reconciliation' })
  async cancel(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CancelRefundDto,
  ) {
    const actor = await requireActiveStaff(user, this.staffAuth);
    return this.refunds.cancel(id, dto, actor, requireIdempotencyKey(idempotencyKey));
  }

  @Post('refunds/:id/resolve')
  @RequirePermission('refunds', 'manage')
  @ApiOperation({ summary: 'Resolve a refund stuck without a provider callback: confirm or cancel (owner/admin)' })
  async resolve(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ResolveRefundDto,
  ) {
    const actor = await requireActiveStaff(user, this.staffAuth);
    await this.processor.resolveRefund(id, dto, actor, requireIdempotencyKey(idempotencyKey));
    return this.refunds.get(id);
  }
}

function requireIdempotencyKey(value: string | undefined) {
  const key = value?.trim();
  if (!key) throw new BadRequestException('Idempotency-Key обязателен');
  if (key.length > 128) throw new BadRequestException('Idempotency-Key слишком длинный');
  return key;
}
