import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { OrdersService } from './orders.service';
import { CreateOrderDto, TransitionDto } from './orders.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { requireActiveStaff } from '../auth/staff-principal';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { AuthzService } from '../authz/authz.service';

/**
 * NOTE: `actor` is hardcoded to a system principal for the MVP core. Auth (JWT +
 * role) and the real actor id land with the auth module; permission checks stay
 * server-side per the Role Permission Matrix.
 */
const SYSTEM_ACTOR = 'system';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly staffAuth: StaffAuthService,
    private readonly authz: AuthzService,
  ) {}

  @ApiOperation({ summary: 'Orders of the authenticated customer (personal account)' })
  @ApiBearerAuth()
  @ApiOkResponse({ description: "The current customer's orders, newest first." })
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthPrincipal) {
    return this.orders.listByCustomer(user.customerId);
  }

  @ApiOperation({ summary: 'Create an order for the authenticated customer' })
  @ApiBearerAuth()
  @ApiCreatedResponse({ description: 'Customer-owned order created.' })
  @Post('mine')
  @UseGuards(JwtAuthGuard)
  createMine(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateOrderDto) {
    return this.orders.create({ ...dto, customerId: user.customerId, channel: 'mobile' }, user.customerId);
  }

  @ApiOperation({ summary: 'List orders by status — staff fulfillment queue' })
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Orders in the given status, newest first.' })
  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('orders', 'queue')
  async queue(@CurrentUser() user: AuthPrincipal, @Query('status') status?: string) {
    await requireActiveStaff(user, this.staffAuth);
    return this.orders.listByStatus((status ?? 'created') as OrderStatus);
  }

  @ApiOperation({ summary: 'Order Event Ledger timeline — customer owner or staff queue read' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiOkResponse({ description: 'Ledger events for the order, newest first.' })
  @ApiNotFoundResponse({ description: 'Order does not exist or is not visible to this user.' })
  @Get(':id/ledger')
  @UseGuards(JwtAuthGuard)
  async ledger(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    const order = await this.orders.get(id);
    if (!order) throw new NotFoundException(`Заказ ${id} не найден`);
    if (user.typ === 'customer') {
      if (order.customerId !== user.customerId) {
        throw new NotFoundException(`Заказ ${id} не найден`);
      }
    } else {
      await requireActiveStaff(user, this.staffAuth);
      if (!user.role || !(await this.authz.can(user.role, 'orders', 'queue'))) {
        throw new ForbiddenException('Недостаточно прав для просмотра заказа');
      }
    }
    return this.orders.ledger(id);
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
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
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
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('orders', 'reserve')
  async reserve(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.orders.reserve(id, await requireActiveStaff(user, this.staffAuth));
  }

  @ApiOperation({
    summary: 'Warehouse fulfillment: assign IMEI units to a web order → reserved',
  })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiOkResponse({ description: 'Units assigned; order moved to reserved.' })
  @ApiConflictResponse({ description: 'Insufficient stock for a line.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown order or illegal state.' })
  @Post(':id/fulfill')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('orders', 'fulfill')
  async fulfill(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.orders.fulfill(id, await requireActiveStaff(user, this.staffAuth));
  }

  @ApiOperation({
    summary: 'Move an order through the guarded state machine',
  })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiOkResponse({ description: 'Order status updated.' })
  @ApiUnprocessableEntityResponse({ description: 'Illegal transition.' })
  @Post(':id/transition')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('orders', 'transition')
  async transition(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: TransitionDto) {
    return this.orders.transition(id, dto.to, await requireActiveStaff(user, this.staffAuth));
  }
}
