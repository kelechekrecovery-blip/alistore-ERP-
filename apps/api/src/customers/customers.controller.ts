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
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { UpsertCustomerDto } from './customers.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthPrincipal } from '../auth/jwt.strategy';

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
  overview(@Param('id') id: string) {
    return this.customers.overview(id);
  }

  @ApiOperation({ summary: 'Get a customer' })
  @ApiParam({ name: 'id', description: 'Customer id' })
  @ApiOkResponse({ description: 'Customer found.' })
  @ApiNotFoundResponse({ description: 'Customer does not exist.' })
  @Get(':id')
  async get(@Param('id') id: string) {
    const customer = await this.customers.get(id);
    if (!customer) throw new NotFoundException(`Клиент ${id} не найден`);
    return customer;
  }

  @ApiOperation({ summary: 'Find-or-create a customer by phone (guest checkout)' })
  @ApiCreatedResponse({ description: 'Customer created or matched by phone.' })
  @Post()
  upsert(@Body() dto: UpsertCustomerDto) {
    return this.customers.upsert(dto);
  }
}
