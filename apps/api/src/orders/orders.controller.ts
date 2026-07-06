import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto, TransitionDto } from './orders.dto';

/**
 * NOTE: `actor` is hardcoded to a system principal for the MVP core. Auth (JWT +
 * role) and the real actor id land with the auth module; permission checks stay
 * server-side per the Role Permission Matrix.
 */
const SYSTEM_ACTOR = 'system';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get(':id')
  async get(@Param('id') id: string) {
    const order = await this.orders.get(id);
    if (!order) throw new NotFoundException(`Заказ ${id} не найден`);
    return order;
  }

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto, SYSTEM_ACTOR);
  }

  @Post(':id/reserve')
  reserve(@Param('id') id: string) {
    return this.orders.reserve(id, SYSTEM_ACTOR);
  }

  @Post(':id/transition')
  transition(@Param('id') id: string, @Body() dto: TransitionDto) {
    return this.orders.transition(id, dto.to, SYSTEM_ACTOR);
  }
}
