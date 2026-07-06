import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { UpsertCustomerDto } from './customers.dto';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

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
