import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
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
import { CreateCustomerAddressDto, SetConsentDto, UpdateCustomerAddressDto, UpdateCustomerSettingsDto, UpsertCustomerDto } from './customers.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import type { Customer } from '@prisma/client';
import type { CustomerOverview } from './customer-overview';
import { issueGuestCheckoutCapability } from '../auth/guest-capability';
import { StaffAuthService } from '../staff-auth/staff-auth.service';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly staffAuth: StaffAuthService,
  ) {}

  @Get('me/loyalty')
  @UseGuards(JwtAuthGuard)
  loyalty(@CurrentUser() user: AuthPrincipal) {
    this.assertCustomer(user);
    return this.customers.loyalty(user.customerId);
  }

  @Get('me/addresses')
  @UseGuards(JwtAuthGuard)
  addresses(@CurrentUser() user: AuthPrincipal) {
    this.assertCustomer(user);
    return this.customers.addresses(user.customerId);
  }

  @Post('me/addresses')
  @UseGuards(JwtAuthGuard)
  createAddress(
    @CurrentUser() user: AuthPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateCustomerAddressDto,
  ) {
    this.assertCustomer(user);
    return this.customers.createAddress(user.customerId, dto, requireIdempotencyKey(idempotencyKey));
  }

  @Patch('me/addresses/:addressId')
  @UseGuards(JwtAuthGuard)
  updateAddress(
    @CurrentUser() user: AuthPrincipal,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateCustomerAddressDto,
  ) {
    this.assertCustomer(user);
    return this.customers.updateAddress(user.customerId, addressId, dto);
  }

  @Delete('me/addresses/:addressId')
  @UseGuards(JwtAuthGuard)
  deleteAddress(@CurrentUser() user: AuthPrincipal, @Param('addressId') addressId: string) {
    this.assertCustomer(user);
    return this.customers.deleteAddress(user.customerId, addressId);
  }

  @Get('me/settings')
  @UseGuards(JwtAuthGuard)
  settings(@CurrentUser() user: AuthPrincipal) {
    this.assertCustomer(user);
    return this.customers.settings(user.customerId);
  }

  @Patch('me/settings')
  @UseGuards(JwtAuthGuard)
  updateSettings(@CurrentUser() user: AuthPrincipal, @Body() dto: UpdateCustomerSettingsDto) {
    this.assertCustomer(user);
    return this.customers.updateSettings(user.customerId, dto);
  }

  @ApiOperation({ summary: 'Export all personal data as one JSON document (self-service)' })
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Profile, addresses, orders, loyalty, coupons and notification preferences.' })
  @Get('me/export')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  exportData(@CurrentUser() user: AuthPrincipal) {
    this.assertCustomer(user);
    return this.customers.exportData(user.customerId);
  }

  @ApiOperation({ summary: 'Delete the account: anonymize PII and revoke sessions; orders stay for accounting' })
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Account anonymized; all sessions revoked.' })
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  deleteAccount(@CurrentUser() user: AuthPrincipal) {
    this.assertCustomer(user);
    return this.customers.deleteAccount(user.customerId);
  }

  @ApiOperation({ summary: 'Devices the authenticated customer bought (IMEI + warranty)' })
  @ApiBearerAuth()
  @ApiOkResponse({ description: "The current customer's devices." })
  @Get('me/devices')
  @UseGuards(JwtAuthGuard)
  myDevices(@CurrentUser() user: AuthPrincipal) {
    this.assertCustomer(user);
    return this.customers.devices(user.customerId);
  }

  @ApiOperation({ summary: 'Customer 360 — orders, spend, debts, warranties, tickets (CRM read)' })
  @ApiParam({ name: 'id', description: 'Customer id' })
  @ApiOkResponse({ description: 'Aggregated customer overview.' })
  @ApiNotFoundResponse({ description: 'Customer does not exist.' })
  @Get(':id/overview')
  @UseGuards(JwtAuthGuard)
  async overview(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    await this.assertCanReadCustomer(user, id);
    return this.maskOverview(await this.customers.overview(id), user);
  }

  @ApiOperation({ summary: 'Get a customer' })
  @ApiParam({ name: 'id', description: 'Customer id' })
  @ApiOkResponse({ description: 'Customer found.' })
  @ApiNotFoundResponse({ description: 'Customer does not exist.' })
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async get(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    await this.assertCanReadCustomer(user, id);
    const customer = await this.customers.get(id);
    if (!customer) throw new NotFoundException(`Клиент ${id} не найден`);
    return this.maskCustomer(customer, user);
  }

  @ApiOperation({ summary: 'Find-or-create a customer by phone (guest checkout)' })
  @ApiCreatedResponse({ description: 'Customer created or matched by phone.' })
  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async upsert(@Body() dto: UpsertCustomerDto) {
    const customer = await this.customers.upsert(dto);
    return {
      ...customer,
      guestCapability: issueGuestCheckoutCapability(customer.id),
      capabilityExpiresIn: 1800,
    };
  }

  @ApiOperation({ summary: 'Set marketing consent (Notification Preferences, customer.consent_changed)' })
  @ApiParam({ name: 'id', description: 'Customer id' })
  @ApiOkResponse({ description: 'Consent updated.' })
  @ApiNotFoundResponse({ description: 'Customer does not exist.' })
  @Patch(':id/consent')
  @UseGuards(JwtAuthGuard)
  setConsent(@Param('id') id: string, @Body() dto: SetConsentDto, @CurrentUser() user: AuthPrincipal) {
    if (user.typ === 'customer' && user.customerId !== id) {
      throw new ForbiddenException('Нельзя менять согласие другого клиента');
    }
    if (user.typ === 'staff' && user.role !== 'admin' && user.role !== 'owner') {
      throw new ForbiddenException('Недостаточно прав для изменения согласия');
    }
    return this.customers.setConsent(id, dto.consent, user.customerId);
  }

  /** A customer may read only their own profile; any authenticated staff may read any. */
  private async assertCanReadCustomer(user: AuthPrincipal, id: string): Promise<void> {
    if (user.typ === 'customer' && user.customerId !== id) {
      throw new ForbiddenException('Нельзя смотреть профиль другого клиента');
    }
    if (user.typ === 'staff') {
      const staff = await this.staffAuth.me(user.customerId);
      if (staff.role !== user.role) {
        throw new ForbiddenException('Роль сотрудника изменена. Войдите снова');
      }
    }
  }

  private assertCustomer(user: AuthPrincipal): void {
    if (user.typ !== 'customer') throw new ForbiddenException('Требуется customer JWT');
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

function requireIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key) throw new BadRequestException('Idempotency-Key обязателен');
  if (key.length > 128) throw new BadRequestException('Idempotency-Key слишком длинный');
  return key;
}
