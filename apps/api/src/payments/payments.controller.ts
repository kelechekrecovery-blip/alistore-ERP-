import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  Optional,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { PayDto, RefundDto, VoidPaymentDto } from './payments.dto';
import { PaymentIntentsService } from './payment-intents.service';
import { CreatePaymentIntentDto, PaymentWebhookDto } from './payment-intents.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { SandboxConfirmGuard } from './sandbox-confirm.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { requireGuestCapability } from '../auth/guest-capability';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { requireActiveStaff } from '../auth/staff-principal';
import { RefundsService } from '../refunds/refunds.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly intents: PaymentIntentsService,
    private readonly staffAuth: StaffAuthService,
    @Optional() private readonly refunds?: RefundsService,
  ) {}

  @ApiOperation({ summary: 'List payments by order or cash shift' })
  @ApiQuery({ name: 'orderId', required: false })
  @ApiQuery({ name: 'shiftId', required: false })
  @ApiOkResponse({ description: 'Payments ordered by newest first.' })
  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('payments', 'read')
  find(@Query('orderId') orderId?: string, @Query('shiftId') shiftId?: string) {
    return this.payments.find({ orderId, shiftId });
  }

  @ApiOperation({
    summary: 'Take payment, sell reserved units, and append ledger events',
  })
  @ApiCreatedResponse({ description: 'Payment received and order moved to paid.' })
  @ApiConflictResponse({ description: 'Order is not reserved or IMEI cannot be sold.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown order or invalid payload.' })
  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  async pay(
    @CurrentUser() user: AuthPrincipal | undefined,
    @Headers('x-guest-capability') capability: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: PayDto,
  ) {
    // Cash/card/installment must be taken by staff (counter/POS) or confirmed by the
    // provider webhook — an unauthenticated caller may only pay by gift card, which is
    // self-validating (redeemOnTx checks the code + balance). Closes the "mark any order
    // paid for free" hole while keeping guest gift-card checkout working.
    if ((!user || user.typ === 'customer') && dto.method !== 'gift_card') {
      throw new UnauthorizedException('payment_requires_auth');
    }
    if (user?.typ === 'customer') {
      return this.payments.payForCustomer(user.customerId, dto, user.customerId);
    }
    if (user?.typ === 'staff') {
      const staffId = await requireActiveStaff(user, this.staffAuth);
      return this.payments.pay(dto, `staff:${staffId}`, { staffId, idempotencyKey });
    }
    const guest = requireGuestCapability(capability, 'payments:gift_card');
    return this.payments.payForCustomer(guest.sub, dto, `guest:${guest.sub}`);
  }

  @ApiOperation({
    summary: 'Create an online payment intent (reserve order → awaiting_payment)',
  })
  @ApiCreatedResponse({ description: 'Payment provider intent created.' })
  @ApiConflictResponse({ description: 'Order cannot be reserved or paid.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown order or amount mismatch.' })
  @Post('intents')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  intent(
    @Headers('x-guest-capability') capability: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    const guest = requireGuestCapability(capability, 'payments:intent');
    return this.intents.createForCustomer(guest.sub, dto, idempotencyKey);
  }

  @ApiOperation({ summary: 'Create an online payment intent for the authenticated customer order' })
  @ApiBearerAuth()
  @ApiCreatedResponse({ description: 'Customer-owned payment provider intent created.' })
  @Post('intents/mine')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  customerIntent(
    @CurrentUser() user: AuthPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    return this.intents.createForCustomer(user.customerId, dto, idempotencyKey);
  }

  @ApiOperation({
    summary: 'Sandbox/provider webhook: confirm an online payment idempotently',
  })
  @ApiOkResponse({ description: 'Payment applied, or duplicate webhook deduped by txnId.' })
  @ApiConflictResponse({ description: 'Order not payable.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown order or invalid payload.' })
  @Post('webhooks/sandbox')
  @HttpCode(200)
  @UseGuards(SandboxConfirmGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  webhook(
    @Req() request: { rawBody?: Buffer; headers: Record<string, string | string[] | undefined> },
    @Body() dto: PaymentWebhookDto,
  ) {
    return this.intents.webhook(dto, { rawBody: request.rawBody, headers: request.headers });
  }

  @ApiOperation({
    summary: 'Request a refund — approval-gated (returns 202 { approvalId })',
  })
  @ApiParam({ name: 'id', description: 'Original payment id' })
  @ApiAcceptedResponse({ description: 'Refund parked for approval; not yet executed.' })
  @ApiConflictResponse({ description: 'Payment is not refundable.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown payment or invalid amount.' })
  @Post(':id/refund')
  @HttpCode(202)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('payments', 'refund')
  async refund(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: RefundDto,
  ) {
    const actor = await requireActiveStaff(user, this.staffAuth);
    if (!dto.returnId) {
      const payment = await this.payments.get(id);
      if (payment?.orderId) throw new BadRequestException('Товарный refund требует Return; используйте POST /returns/:returnId/refunds');
      return this.payments.refund(id, dto.amount, dto.reason, actor, undefined, {
        shiftId: dto.shiftId,
        externalReference: dto.externalReference,
        allocations: dto.allocations,
      });
    }
    if (!this.refunds) throw new BadRequestException('Refund aggregate service unavailable');
    return this.refunds.request(dto.returnId, { reason: dto.reason, shiftId: dto.shiftId }, actor, requireRefundIdempotencyKey(idempotencyKey));
  }

  @ApiOperation({ summary: 'Void an unfinished pending payment without creating a refund' })
  @ApiBearerAuth()
  @Post(':id/void')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('payments', 'refund')
  async voidPayment(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: VoidPaymentDto,
  ) {
    const actor = await requireActiveStaff(user, this.staffAuth);
    return this.payments.voidPending(id, dto.reason, actor, requireRefundIdempotencyKey(idempotencyKey));
  }
}

function requireRefundIdempotencyKey(value: string | undefined) {
  const key = value?.trim();
  if (!key) throw new BadRequestException('Idempotency-Key обязателен');
  if (key.length > 128) throw new BadRequestException('Idempotency-Key слишком длинный');
  return key;
}
