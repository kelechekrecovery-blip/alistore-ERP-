import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { SupplierRmaService } from './supplier-rma.service';
import { CreateSupplierDto, OpenRmaDto, RmaTransitionDto } from './suppliers.dto';

const SYSTEM_ACTOR = 'system';

@ApiTags('suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly rma: SupplierRmaService) {}

  @ApiOperation({ summary: 'Register a supplier' })
  @ApiCreatedResponse({ description: 'Supplier created.' })
  @Post()
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.rma.createSupplier(dto);
  }

  @ApiOperation({ summary: 'List suppliers' })
  @Get()
  listSuppliers() {
    return this.rma.listSuppliers();
  }

  @ApiOperation({ summary: 'Supplier scorecard — volume, resolution rate, open backlog' })
  @ApiOkResponse({ description: 'One score row per supplier.' })
  @Get('scorecard')
  scorecard() {
    return this.rma.scorecard();
  }

  @ApiOperation({ summary: 'Open an RMA for a defective unit (unit → in_repair, rma.opened)' })
  @ApiCreatedResponse({ description: 'RMA opened; ledger event written.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown supplier or unit.' })
  @Post('rma')
  openRma(@Body() dto: OpenRmaDto) {
    return this.rma.open(dto, dto.actor ?? SYSTEM_ACTOR);
  }

  @ApiOperation({ summary: 'List RMAs (filter by supplierId/status)' })
  @Get('rma')
  listRmas(@Query('supplierId') supplierId?: string, @Query('status') status?: string) {
    return this.rma.listRmas({ supplierId, status });
  }

  @ApiOperation({ summary: 'Advance an RMA through its status machine' })
  @ApiOkResponse({ description: 'RMA transitioned.' })
  @ApiConflictResponse({ description: 'Illegal transition.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown RMA.' })
  @Patch('rma/:id/transition')
  transition(@Param('id') id: string, @Body() dto: RmaTransitionDto) {
    return this.rma.transition(id, dto.to, dto.actor ?? SYSTEM_ACTOR);
  }
}
