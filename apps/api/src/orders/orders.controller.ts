import {
  Body,
  Controller,
  Get,
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
import { OrdersService } from './orders.service';
import { CreateOrderDto, TransitionDto } from './orders.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthPrincipal } from '../auth/jwt.strategy';

/**
 * NOTE: `actor` is hardcoded to a system principal for the MVP core. Auth (JWT +
 * role) and the real actor id land with the auth module; permission checks stay
 * server-side per the Role Permission Matrix.
 */
const SYSTEM_ACTOR = 'system';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @ApiOperation({ summary: 'Orders of the authenticated customer (personal account)' })
  @ApiBearerAuth()
  @ApiOkResponse({ description: "The current customer's orders, newest first." })
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthPrincipal) {
    return this.orders.listByCustomer(user.customerId);
  }

  @ApiOperation({ summary: 'Get an order with items and payments' })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiOkResponse({ description: 'Order found.' })
  @ApiNotFoundResponse({ description: 'Order does not exist.' })
  @Get(':id')
  async get(@Param('id') id: string) {
    const order = await this.orders.get(id);
    if (!order) throw new NotFoundException(`Заказ ${id} не найден`);
    return order;
  }

  @ApiOperation({
    summary: 'Create an order and append order.created to the Event Ledger',
  })
  @ApiCreatedResponse({ description: 'Order created.' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid order payload.' })
  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto, SYSTEM_ACTOR);
  }

  @ApiOperation({
    summary: 'Reserve IMEI stock for an order and append reservation events',
  })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiOkResponse({ description: 'Order moved to reserved.' })
  @ApiConflictResponse({ description: 'IMEI is unavailable or already sold.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown order or illegal state.' })
  @Post(':id/reserve')
  reserve(@Param('id') id: string) {
    return this.orders.reserve(id, SYSTEM_ACTOR);
  }

  @ApiOperation({
    summary: 'Move an order through the guarded state machine',
  })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiOkResponse({ description: 'Order status updated.' })
  @ApiUnprocessableEntityResponse({ description: 'Illegal transition.' })
  @Post(':id/transition')
  transition(@Param('id') id: string, @Body() dto: TransitionDto) {
    return this.orders.transition(id, dto.to, SYSTEM_ACTOR);
  }
}
