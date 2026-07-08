import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
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
import { PayDto, RefundDto } from './payments.dto';
import { PaymentIntentsService } from './payment-intents.service';
import { CreatePaymentIntentDto, PaymentWebhookDto } from './payment-intents.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';

const SYSTEM_ACTOR = 'system';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly intents: PaymentIntentsService,
  ) {}

  @ApiOperation({ summary: 'List payments by order or cash shift' })
  @ApiQuery({ name: 'orderId', required: false })
  @ApiQuery({ name: 'shiftId', required: false })
  @ApiOkResponse({ description: 'Payments ordered by newest first.' })
  @Get()
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
  pay(@Body() dto: PayDto) {
    return this.payments.pay(dto, SYSTEM_ACTOR);
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
  intent(@Body() dto: CreatePaymentIntentDto) {
    return this.intents.create(dto);
  }

  @ApiOperation({
    summary: 'Sandbox/provider webhook: confirm an online payment idempotently',
  })
  @ApiOkResponse({ description: 'Payment applied, or duplicate webhook deduped by txnId.' })
  @ApiConflictResponse({ description: 'Order not payable.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown order or invalid payload.' })
  @Post('webhooks/sandbox')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  webhook(@Body() dto: PaymentWebhookDto) {
    return this.intents.webhook(dto);
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
  refund(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: RefundDto) {
    return this.payments.refund(id, dto.amount, dto.reason, user.customerId);
  }
}
