import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { SupplierRmaService } from './supplier-rma.service';
import { CreateSupplierDto, OpenRmaDto, RmaTransitionDto } from './suppliers.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';

@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly rma: SupplierRmaService) {}

  @ApiOperation({ summary: 'Register a supplier' })
  @ApiCreatedResponse({ description: 'Supplier created.' })
  @Post()
  @RequirePermission('suppliers', 'create')
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.rma.createSupplier(dto);
  }

  @ApiOperation({ summary: 'List suppliers' })
  @Get()
  @RequirePermission('suppliers', 'read')
  listSuppliers() {
    return this.rma.listSuppliers();
  }

  @ApiOperation({ summary: 'Supplier scorecard — volume, resolution rate, open backlog' })
  @ApiOkResponse({ description: 'One score row per supplier.' })
  @Get('scorecard')
  @RequirePermission('suppliers', 'scorecard')
  scorecard() {
    return this.rma.scorecard();
  }

  @ApiOperation({ summary: 'Open an RMA for a defective unit (unit → in_repair, rma.opened)' })
  @ApiCreatedResponse({ description: 'RMA opened; ledger event written.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown supplier or unit.' })
  @Post('rma')
  @RequirePermission('suppliers', 'rma_open')
  openRma(@CurrentUser() user: AuthPrincipal, @Body() dto: OpenRmaDto) {
    return this.rma.open(dto, user.customerId);
  }

  @ApiOperation({ summary: 'List RMAs (filter by supplierId/status)' })
  @Get('rma')
  @RequirePermission('suppliers', 'rma_read')
  listRmas(@Query('supplierId') supplierId?: string, @Query('status') status?: string) {
    return this.rma.listRmas({ supplierId, status });
  }

  @ApiOperation({ summary: 'Advance an RMA through its status machine' })
  @ApiOkResponse({ description: 'RMA transitioned.' })
  @ApiConflictResponse({ description: 'Illegal transition.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown RMA.' })
  @Patch('rma/:id/transition')
  @RequirePermission('suppliers', 'rma_transition')
  transition(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: RmaTransitionDto) {
    return this.rma.transition(id, dto.to, user.customerId);
  }
}
