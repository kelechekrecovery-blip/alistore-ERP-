import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PayDto } from './payments.dto';

const SYSTEM_ACTOR = 'system';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  find(@Query('orderId') orderId?: string, @Query('shiftId') shiftId?: string) {
    return this.payments.find({ orderId, shiftId });
  }

  @Post()
  pay(@Body() dto: PayDto) {
    return this.payments.pay(dto, SYSTEM_ACTOR);
  }
}
