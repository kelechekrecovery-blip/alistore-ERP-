import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CustomersService } from './customers.service';
import { SetConsentDto, UpsertCustomerDto } from './customers.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import type { Customer } from '@prisma/client';
import type { CustomerOverview } from './customer-overview';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @ApiOperation({ summary: 'Devices the authenticated customer bought (IMEI + warranty)' })
  @ApiBearerAuth()
  @ApiOkResponse({ description: "The current customer's devices." })
  @Get('me/devices')
  @UseGuards(JwtAuthGuard)
  myDevices(@CurrentUser() user: AuthPrincipal) {
    return this.customers.devices(user.customerId);
  }

  @ApiOperation({ summary: 'Customer 360 — orders, spend, debts, warranties, tickets (CRM read)' })
  @ApiParam({ name: 'id', description: 'Customer id' })
  @ApiOkResponse({ description: 'Aggregated customer overview.' })
  @ApiNotFoundResponse({ description: 'Customer does not exist.' })
  @Get(':id/overview')
  @UseGuards(JwtAuthGuard)
  async overview(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    this.assertCanReadCustomer(user, id);
    return this.maskOverview(await this.customers.overview(id), user);
  }

  @ApiOperation({ summary: 'Get a customer' })
  @ApiParam({ name: 'id', description: 'Customer id' })
  @ApiOkResponse({ description: 'Customer found.' })
  @ApiNotFoundResponse({ description: 'Customer does not exist.' })
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async get(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    this.assertCanReadCustomer(user, id);
    const customer = await this.customers.get(id);
    if (!customer) throw new NotFoundException(`Клиент ${id} не найден`);
    return this.maskCustomer(customer, user);
  }

  @ApiOperation({ summary: 'Find-or-create a customer by phone (guest checkout)' })
  @ApiCreatedResponse({ description: 'Customer created or matched by phone.' })
  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  upsert(@Body() dto: UpsertCustomerDto) {
    return this.customers.upsert(dto);
  }

  @ApiOperation({ summary: 'Set marketing consent (Notification Preferences, customer.consent_changed)' })
  @ApiParam({ name: 'id', description: 'Customer id' })
  @ApiOkResponse({ description: 'Consent updated.' })
  @ApiNotFoundResponse({ description: 'Customer does not exist.' })
  @Patch(':id/consent')
  @UseGuards(OptionalJwtAuthGuard)
  setConsent(@Param('id') id: string, @Body() dto: SetConsentDto, @CurrentUser() user?: AuthPrincipal) {
    if (user?.typ === 'customer' && user.customerId !== id) {
      throw new ForbiddenException('Нельзя менять согласие другого клиента');
    }
    return this.customers.setConsent(id, dto.consent, user?.typ === 'customer' ? user.customerId : dto.actor ?? 'customer');
  }

  /** A customer may read only their own profile; any authenticated staff may read any. */
  private assertCanReadCustomer(user: AuthPrincipal, id: string): void {
    if (user.typ === 'customer' && user.customerId !== id) {
      throw new ForbiddenException('Нельзя смотреть профиль другого клиента');
    }
  }

  private maskOverview(overview: CustomerOverview, user?: AuthPrincipal): CustomerOverview {
    if (this.canReadPii(user, overview.customer.id)) return overview;
    return {
      ...overview,
      customer: {
        ...overview.customer,
        phone: this.maskPhone(overview.customer.phone),
      },
    };
  }

  private maskCustomer(customer: Customer, user?: AuthPrincipal): Customer {
    if (this.canReadPii(user, customer.id)) return customer;
    return { ...customer, phone: this.maskPhone(customer.phone) };
  }

  private canReadPii(user: AuthPrincipal | undefined, customerId: string): boolean {
    if (user?.typ === 'customer') return user.customerId === customerId;
    if (user?.typ === 'staff') return user.role === 'admin' || user.role === 'owner';
    return false;
  }

  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 4) return '***';
    const prefix = phone.startsWith('+') ? `+${digits.slice(0, 3)}` : digits.slice(0, 3);
    return `${prefix}******${digits.slice(-2)}`;
  }
}
