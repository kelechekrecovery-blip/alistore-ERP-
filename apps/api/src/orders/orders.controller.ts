import {
  Body,
  Controller,
  ConflictException,
  ForbiddenException,
  Get,
  Headers,
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
import { CreateMyOrderDto, CreateOrderDto, TransitionDto } from './orders.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { requireActiveStaff } from '../auth/staff-principal';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { AuthzService } from '../authz/authz.service';
import { guestOrderCapabilityTtlSeconds, issueGuestOrderCapability, requireGuestCapability } from '../auth/guest-capability';
import { ReceiptsService } from '../receipts/receipts.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly staffAuth: StaffAuthService,
    private readonly authz: AuthzService,
    private readonly receipts: ReceiptsService,
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
  createMine(
    @CurrentUser() user: AuthPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateMyOrderDto,
  ) {
    return this.orders.createFromCatalog(
      { ...dto, customerId: user.customerId, channel: dto.channel === 'web' ? 'web' : 'mobile' },
      user.customerId,
      idempotencyKey,
      true,
    );
  }

  @ApiOperation({ summary: 'List orders by status — staff fulfillment queue' })
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Orders in the given status, newest first.' })
  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('orders', 'queue')
  async queue(@CurrentUser() user: AuthPrincipal, @Query('status') status?: string) {
    const staffId = await requireActiveStaff(user, this.staffAuth);
    return this.orders.listByStatusForStaff((status ?? 'created') as OrderStatus, staffId);
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
      const staffId = await requireActiveStaff(user, this.staffAuth);
      if (!user.role || !(await this.authz.can(user.role, 'orders', 'queue'))) {
        throw new ForbiddenException('Недостаточно прав для просмотра заказа');
      }
      if (await this.orders.isOwnOpenShiftOrder(id, staffId)) {
        throw new ForbiddenException('Леджер кассового заказа доступен после закрытия смены');
      }
    }
    return this.orders.ledger(id);
  }

  @ApiOperation({ summary: 'Get an order with items and payments' })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiOkResponse({ description: 'Order found.' })
  @ApiNotFoundResponse({ description: 'Order does not exist.' })
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async get(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    let order = await this.orders.get(id);
    if (!order) throw new NotFoundException(`Заказ ${id} не найден`);
    if (user.typ === 'customer') {
      if (order.customerId !== user.customerId) {
        throw new NotFoundException(`Заказ ${id} не найден`);
      }
    } else {
      const staffId = await requireActiveStaff(user, this.staffAuth);
      if (!user.role || !(await this.authz.can(user.role, 'orders', 'queue'))) {
        throw new ForbiddenException('Недостаточно прав для просмотра заказа');
      }
      order = await this.orders.getForStaff(id, staffId);
    }
    return order;
  }

  @ApiOperation({ summary: 'Render a paid receipt for the authenticated customer' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Customer-owned order id' })
  @ApiOkResponse({ description: 'Receipt markup for the paid order.' })
  @Get(':id/receipt')
  @UseGuards(JwtAuthGuard)
  async customerReceipt(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    const order = await this.orders.get(id);
    if (!order) throw new NotFoundException(`Заказ ${id} не найден`);
    if (user.typ !== 'customer' || order.customerId !== user.customerId) {
      throw new NotFoundException(`Заказ ${id} не найден`);
    }
    const paid = order.payments.some((payment) => payment.amount > 0 && ['received', 'reconciled'].includes(payment.status));
    if (!paid) throw new ConflictException('receipt_not_available');
    const receipt = await this.receipts.renderOrder(id);
    return { markup: receipt.markup };
  }

  @ApiOperation({ summary: 'Read one guest order through an order-scoped capability' })
  @ApiParam({ name: 'id', description: 'Order id bound into the capability' })
  @Get(':id/guest')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async guestOrder(@Headers('x-guest-capability') capability: string | undefined, @Param('id') id: string) {
    const claims = requireGuestCapability(capability, 'orders:read', undefined, { type: 'order', id });
    const order = await this.orders.getGuest(id);
    if (!order || order.customerId !== claims.sub) throw new NotFoundException(`Заказ ${id} не найден`);
    const ledger = await this.orders.ledger(id);
    const { customerId: _, ...safeOrder } = order;
    return {
      order: safeOrder,
      timeline: ledger.map((event) => ({ type: event.type, ts: event.ts })),
    };
  }

  @ApiOperation({ summary: 'Read a guest receipt through an order-scoped capability' })
  @ApiParam({ name: 'id', description: 'Order id bound into the capability' })
  @Get(':id/guest-receipt')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async guestReceipt(@Headers('x-guest-capability') capability: string | undefined, @Param('id') id: string) {
    const claims = requireGuestCapability(capability, 'receipts:read', undefined, { type: 'order', id });
    const order = await this.orders.get(id);
    if (!order || order.customerId !== claims.sub) throw new NotFoundException(`Заказ ${id} не найден`);
    const paid = order.payments.some((payment) => payment.amount > 0 && ['received', 'reconciled'].includes(payment.status));
    if (!paid) throw new ConflictException('receipt_not_available');
    const receipt = await this.receipts.renderOrder(id);
    return { markup: receipt.markup };
  }

  @ApiOperation({
    summary: 'Create an order and append order.created to the Event Ledger',
  })
  @ApiCreatedResponse({ description: 'Order created.' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid order payload.' })
  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async create(
    @Headers('x-guest-capability') capability: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateOrderDto,
  ) {
    const guest = requireGuestCapability(capability, 'orders:create', dto.customerId);
    const order = await this.orders.createFromCatalog(dto, `guest:${guest.sub}`, idempotencyKey, false);
    const expiresIn = guestOrderCapabilityTtlSeconds();
    return {
      ...order,
      guestAccess: {
        capability: issueGuestOrderCapability(order.customerId, order.id, expiresIn),
        expiresIn,
      },
    };
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
    const staffId = await requireActiveStaff(user, this.staffAuth);
    if (user.role === 'courier') {
      throw new ForbiddenException('Курьер меняет доставку только через courier endpoints с COD и idempotency');
    }
    return this.orders.transition(id, dto.to, staffId);
  }
}
