import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import {
  CountDto,
  CreateConsignmentPayoutDto,
  DiagnoseQuarantineDto,
  DisposeQuarantineDto,
  MovementDto,
  PayConsignmentPayoutDto,
  ReceiveConsignmentDto,
  ReceiveQuantityConsignmentDto,
  ReceiveDto,
  ReceiveQuantityDto,
  TransferDto,
  TransferQuantityDto,
  ValuationRollForwardQueryDto,
} from './inventory.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { requireActiveStaff } from '../auth/staff-principal';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly staffAuth: StaffAuthService,
  ) {}

  @ApiOperation({
    summary: 'Stock write-off / adjustment — always approval-gated (202 { approvalId })',
  })
  @ApiAcceptedResponse({ description: 'Movement parked for approval; not yet applied.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown product.' })
  @Post('movements')
  @HttpCode(202)
  @RequirePermission('inventory', 'movement')
  async movement(@CurrentUser() user: AuthPrincipal, @Body() dto: MovementDto) {
    return this.inventory.movement(dto, await requireActiveStaff(user, this.staffAuth));
  }

  @ApiOperation({ summary: 'Receive a batch of IMEI units into stock (stock.received)' })
  @ApiCreatedResponse({ description: 'Units created in stock; movement + ledger events written.' })
  @ApiConflictResponse({ description: 'One or more IMEI values already exist.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown product or invalid IMEI batch.' })
  @Post('receive')
  @RequirePermission('inventory', 'receive')
  async receive(@CurrentUser() user: AuthPrincipal, @Body() dto: ReceiveDto) {
    return this.inventory.receive(dto, await requireActiveStaff(user, this.staffAuth));
  }

  @ApiOperation({ summary: 'Receive quantity-tracked stock into a location (stock.received)' })
  @ApiCreatedResponse({ description: 'Authoritative location balance incremented; movement and ledger event written.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown, serialized, or virtual bundle product.' })
  @Post('receive-quantity')
  @RequirePermission('inventory', 'receive')
  async receiveQuantity(@CurrentUser() user: AuthPrincipal, @Body() dto: ReceiveQuantityDto) {
    return this.inventory.receiveQuantity(dto, await requireActiveStaff(user, this.staffAuth));
  }

  @ApiOperation({ summary: 'Receive a serialized third-party-owned consignment unit' })
  @Post('consignments/receive')
  @RequirePermission('inventory', 'consignment_receive')
  async receiveConsignment(@CurrentUser() user: AuthPrincipal, @Body() dto: ReceiveConsignmentDto) {
    return this.inventory.receiveConsignment(dto, await requireActiveStaff(user, this.staffAuth));
  }

  @ApiOperation({ summary: 'Receive a quantity-tracked third-party-owned consignment lot' })
  @Post('consignments/receive-quantity')
  @RequirePermission('inventory', 'consignment_receive')
  async receiveQuantityConsignment(@CurrentUser() user: AuthPrincipal, @Body() dto: ReceiveQuantityConsignmentDto) {
    return this.inventory.receiveQuantityConsignment(dto, await requireActiveStaff(user, this.staffAuth));
  }

  @ApiOperation({ summary: 'List consignment stock and accrued owner liabilities' })
  @Get('consignments')
  @RequirePermission('inventory', 'consignment_read')
  async listConsignments(@CurrentUser() user: AuthPrincipal) {
    await requireActiveStaff(user, this.staffAuth);
    return this.inventory.listConsignments();
  }

  @ApiOperation({ summary: 'List quantity consignment lots and owner liabilities' })
  @Get('consignments/quantity')
  @RequirePermission('inventory', 'consignment_read')
  async listQuantityConsignments(@CurrentUser() user: AuthPrincipal) {
    await requireActiveStaff(user, this.staffAuth);
    return this.inventory.listQuantityConsignments();
  }

  @ApiOperation({ summary: 'List consignment payout batches' })
  @Get('consignments/payouts')
  @RequirePermission('inventory', 'consignment_payout')
  async listConsignmentPayouts(@CurrentUser() user: AuthPrincipal) {
    await requireActiveStaff(user, this.staffAuth);
    return this.inventory.listConsignmentPayouts();
  }

  @ApiOperation({ summary: 'List owner compensation obligations created by paid-item returns' })
  @Get('consignments/adjustments')
  @RequirePermission('inventory', 'consignment_payout')
  async listConsignmentAdjustments(@CurrentUser() user: AuthPrincipal) {
    await requireActiveStaff(user, this.staffAuth);
    return this.inventory.listConsignmentAdjustments();
  }

  @ApiOperation({ summary: 'Create an owner payout from completed consignment sales' })
  @Post('consignments/payouts')
  @RequirePermission('inventory', 'consignment_payout')
  async createConsignmentPayout(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateConsignmentPayoutDto) {
    return this.inventory.createConsignmentPayout(dto, await requireActiveStaff(user, this.staffAuth));
  }

  @ApiOperation({ summary: 'Mark a consignment payout paid with an idempotent external payment key' })
  @Post('consignments/payouts/:id/pay')
  @RequirePermission('inventory', 'consignment_payout')
  async payConsignmentPayout(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: PayConsignmentPayoutDto,
  ) {
    return this.inventory.payConsignmentPayout(id, dto, await requireActiveStaff(user, this.staffAuth));
  }

  @ApiOperation({ summary: 'Transfer an in_stock unit to another branch (stock.moved)' })
  @ApiCreatedResponse({ description: 'Unit moved; movement + ledger event written.' })
  @ApiConflictResponse({ description: 'Unit not in stock (sold/reserved).' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown unit or same location.' })
  @Post('transfer')
  @RequirePermission('inventory', 'transfer')
  async transfer(@CurrentUser() user: AuthPrincipal, @Body() dto: TransferDto) {
    return this.inventory.transfer(dto, await requireActiveStaff(user, this.staffAuth));
  }

  @ApiOperation({ summary: 'Transfer quantity-tracked stock between locations exactly once' })
  @Post('transfer-quantity')
  @RequirePermission('inventory', 'transfer')
  async transferQuantity(@CurrentUser() user: AuthPrincipal, @Body() dto: TransferQuantityDto) {
    return this.inventory.transferQuantity(dto, await requireActiveStaff(user, this.staffAuth));
  }

  @ApiOperation({ summary: 'Take inventory for a product at a location (inventory.counted)' })
  @ApiCreatedResponse({ description: 'Count recorded with counted/expected/diff.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown product.' })
  @Post('count')
  @RequirePermission('inventory', 'count')
  async count(@CurrentUser() user: AuthPrincipal, @Body() dto: CountDto) {
    return this.inventory.count(dto, await requireActiveStaff(user, this.staffAuth));
  }

  @ApiOperation({ summary: 'Reconcile owned inventory valuation layers with GL account 1200' })
  @Get('valuation/reconciliation')
  @RequirePermission('finance', 'read')
  async valuationReconciliation(@CurrentUser() user: AuthPrincipal) {
    await requireActiveStaff(user, this.staffAuth);
    return this.inventory.valuationReconciliation();
  }

  @ApiOperation({ summary: 'Historical owned inventory valuation roll-forward for [from,to)' })
  @Get('valuation/roll-forward')
  @RequirePermission('finance', 'read')
  async valuationRollForward(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: ValuationRollForwardQueryDto,
  ) {
    await requireActiveStaff(user, this.staffAuth);
    return this.inventory.valuationRollForward(query.from, query.to);
  }

  @ApiOperation({ summary: 'List serialized units awaiting or completing quarantine disposition' })
  @Get('quarantine')
  @RequirePermission('inventory', 'count')
  async listQuarantine(@CurrentUser() user: AuthPrincipal) {
    await requireActiveStaff(user, this.staffAuth);
    return this.inventory.listQuarantine();
  }

  @ApiOperation({ summary: 'Diagnose a quarantined IMEI after trusted staff photo evidence' })
  @Post('quarantine/:id/diagnose')
  @RequirePermission('inventory', 'count')
  async diagnoseQuarantine(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: DiagnoseQuarantineDto,
  ) {
    return this.inventory.diagnoseQuarantine(id, dto, await requireActiveStaff(user, this.staffAuth));
  }

  @ApiOperation({ summary: 'Apply a four-eyes quarantine disposition to the IMEI' })
  @Post('quarantine/:id/dispose')
  @RequirePermission('inventory', 'movement')
  async disposeQuarantine(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: DisposeQuarantineDto,
  ) {
    return this.inventory.disposeQuarantine(id, dto, await requireActiveStaff(user, this.staffAuth));
  }
}
