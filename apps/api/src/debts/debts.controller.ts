import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { DebtsService } from './debts.service';
import { CreateDebtDto, DebtPaymentDto } from './debts.dto';

const SYSTEM_ACTOR = 'system';

@ApiTags('debts')
@Controller('debts')
export class DebtsController {
  constructor(private readonly debts: DebtsService) {}

  @ApiOperation({ summary: 'Book a debt/installment sale — over the limit returns 202 { approvalId }' })
  @ApiCreatedResponse({ description: 'Debt booked (within limit).' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown order.' })
  @Post()
  create(@Body() dto: CreateDebtDto) {
    return this.debts.create(dto, dto.actor ?? SYSTEM_ACTOR);
  }

  @ApiOperation({ summary: 'List debts (filter by customerId/status)' })
  @Get()
  list(@Query('customerId') customerId?: string, @Query('status') status?: string) {
    return this.debts.list({ customerId, status });
  }

  @ApiOperation({ summary: 'Record a payment against a debt (settles at zero balance)' })
  @ApiOkResponse({ description: 'Payment recorded; balance reduced.' })
  @ApiConflictResponse({ description: 'Debt not open.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown debt or invalid amount.' })
  @Post(':id/payments')
  pay(@Param('id') id: string, @Body() dto: DebtPaymentDto) {
    return this.debts.pay(id, dto, dto.actor ?? SYSTEM_ACTOR);
  }
}
