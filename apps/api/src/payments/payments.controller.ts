import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { PayDto, RefundDto } from './payments.dto';

const SYSTEM_ACTOR = 'system';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

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
    summary: 'Request a refund — approval-gated (returns 202 { approvalId })',
  })
  @ApiParam({ name: 'id', description: 'Original payment id' })
  @ApiAcceptedResponse({ description: 'Refund parked for approval; not yet executed.' })
  @ApiConflictResponse({ description: 'Payment is not refundable.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown payment or invalid amount.' })
  @Post(':id/refund')
  @HttpCode(202)
  refund(@Param('id') id: string, @Body() dto: RefundDto) {
    return this.payments.refund(id, dto.amount, dto.reason, dto.requester ?? SYSTEM_ACTOR);
  }
}
