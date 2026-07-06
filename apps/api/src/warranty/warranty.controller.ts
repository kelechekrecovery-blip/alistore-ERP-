import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { WarrantyService } from './warranty.service';
import { OpenWarrantyDto, WarrantyStatusDto } from './warranty.dto';

const SYSTEM_ACTOR = 'system';

@ApiTags('warranty')
@Controller('warranty')
export class WarrantyController {
  constructor(private readonly warranty: WarrantyService) {}

  @ApiOperation({ summary: 'List warranty cases by customer / imei / status' })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'imei', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiOkResponse({ description: 'Cases ordered by SLA (soonest first).' })
  @Get()
  list(
    @Query('customerId') customerId?: string,
    @Query('imei') imei?: string,
    @Query('status') status?: string,
  ) {
    return this.warranty.list({ customerId, imei, status });
  }

  @ApiOperation({ summary: 'Get a warranty case' })
  @ApiNotFoundResponse({ description: 'Case does not exist.' })
  @Get(':id')
  async getOne(@Param('id') id: string) {
    const wc = await this.warranty.get(id);
    if (!wc) throw new NotFoundException(`Гарантия ${id} не найдена`);
    return wc;
  }

  @ApiOperation({ summary: 'Open a warranty case (warranty.created, SLA set)' })
  @ApiCreatedResponse({ description: 'Case opened.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown device.' })
  @Post()
  open(@Body() dto: OpenWarrantyDto) {
    return this.warranty.open(dto, SYSTEM_ACTOR);
  }

  @ApiOperation({ summary: 'Advance a warranty case through its status machine' })
  @ApiOkResponse({ description: 'Status updated.' })
  @ApiUnprocessableEntityResponse({ description: 'Illegal transition.' })
  @Patch(':id')
  transition(@Param('id') id: string, @Body() dto: WarrantyStatusDto) {
    return this.warranty.transition(id, dto.status, SYSTEM_ACTOR);
  }
}
