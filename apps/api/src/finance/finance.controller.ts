import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { AccountableAdvanceQueryDto, ArAgingQueryDto, CloseAccountableAdvanceDto, CloseAccountingPeriodDto, CloseFinanceSettlementDto, CreateAccountableAdvanceDto, CreateCashIncassationDto, CreateCurrencyRateDto, CreateExpenseDto, CreateFinanceSettlementDto, CreateFixedAssetDto, CreateManualAdjustmentDto, CreateOpeningBalanceDto, CurrencyRateQueryDto, DepreciateFixedAssetDto, FinanceAccountingQueryDto, FinancePeriodQueryDto, FinanceSettlementQueryDto, FxExposureQueryDto, PayExpenseDto, RejectExpenseDto, ResolveFinanceSettlementDto, ReverseAccountingEntryDto, SetFinanceBudgetDto, SettleAccountableAdvanceDto, SettleTaxPeriodDto, SupplierAgingQueryDto } from './finance.dto';
import { FinanceService } from './finance.service';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller('finance/expenses')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  @RequirePermission('finance', 'read')
  list(@Query('status') status?: string) {
    return this.finance.list(status);
  }

  @Post()
  @RequirePermission('finance', 'create')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateExpenseDto) {
    return this.finance.create(dto, user.customerId);
  }

  @Post(':id/approve')
  @RequirePermission('finance', 'approve')
  approve(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.finance.approve(id, user.customerId);
  }

  @Post(':id/reject')
  @RequirePermission('finance', 'approve')
  reject(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: RejectExpenseDto) {
    return this.finance.reject(id, dto.note, user.customerId);
  }

  @Post(':id/pay')
  @RequirePermission('finance', 'pay')
  pay(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: PayExpenseDto) {
    return this.finance.pay(id, dto, user.customerId);
  }
}

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller('finance')
export class FinancePlanningController {
  constructor(private readonly finance: FinanceService) {}

  @Get('accounts')
  @RequirePermission('finance', 'read')
  accounts() {
    return this.finance.listAccountingAccounts();
  }

  @Get('currency-rates')
  @RequirePermission('finance', 'read')
  currencyRates(@Query() query: CurrencyRateQueryDto) {
    return this.finance.listCurrencyRates(query);
  }

  @Get('fx-exposure')
  @RequirePermission('finance', 'read')
  fxExposure(@Query() query: FxExposureQueryDto) {
    return this.finance.fxExposure(query);
  }

  @Post('currency-rates')
  @RequirePermission('finance', 'approve')
  createCurrencyRate(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateCurrencyRateDto) {
    return this.finance.createCurrencyRate(dto, user.customerId);
  }

  @Get('cash-incassations')
  @RequirePermission('finance', 'read')
  cashIncassations(@Query('point') point?: string) {
    return this.finance.listCashIncassations(point);
  }

  @Post('cash-incassations/:shiftId')
  @RequirePermission('finance', 'create')
  cashIncassation(@CurrentUser() user: AuthPrincipal, @Param('shiftId') shiftId: string, @Headers('idempotency-key') idempotencyKey: string | undefined, @Body() dto: CreateCashIncassationDto) {
    if (!idempotencyKey?.trim()) throw new BadRequestException('Требуется Idempotency-Key');
    return this.finance.createCashIncassation(shiftId, dto, user.customerId, idempotencyKey.trim());
  }

  @Get('periods')
  @RequirePermission('finance', 'read')
  periods() {
    return this.finance.listAccountingPeriods();
  }

  @Get('periods/:period/readiness')
  @RequirePermission('finance', 'read')
  periodReadiness(@Param('period') period: string) {
    return this.finance.accountingPeriodReadiness(period);
  }

  @Get('opening-balances')
  @RequirePermission('finance', 'read')
  openingBalances() {
    return this.finance.listOpeningBalances();
  }

  @Post('opening-balances')
  @RequirePermission('finance', 'approve')
  openingBalance(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateOpeningBalanceDto) {
    return this.finance.createOpeningBalance(dto, user.customerId);
  }

  @Get('fixed-assets')
  @RequirePermission('finance', 'read')
  fixedAssets() {
    return this.finance.listFixedAssets();
  }

  @Post('fixed-assets')
  @RequirePermission('finance', 'approve')
  createFixedAsset(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateFixedAssetDto) {
    return this.finance.createFixedAsset(dto, user.customerId);
  }

  @Post('fixed-assets/:id/depreciation')
  @RequirePermission('finance', 'approve')
  depreciateFixedAsset(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: DepreciateFixedAssetDto) {
    return this.finance.depreciateFixedAsset(id, dto, user.customerId);
  }

  @Get('accountable-advances')
  @RequirePermission('finance', 'read')
  accountableAdvances(@Query() query: AccountableAdvanceQueryDto) {
    return this.finance.listAccountableAdvances(query);
  }

  @Post('accountable-advances')
  @RequirePermission('finance', 'pay')
  createAccountableAdvance(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateAccountableAdvanceDto) {
    return this.finance.createAccountableAdvance(dto, user.customerId);
  }

  @Post('accountable-advances/:id/settle')
  @RequirePermission('finance', 'approve')
  settleAccountableAdvance(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: SettleAccountableAdvanceDto) {
    return this.finance.settleAccountableAdvance(id, dto, user.customerId);
  }

  @Post('accountable-advances/:id/return')
  @RequirePermission('finance', 'pay')
  returnAccountableAdvance(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: CloseAccountableAdvanceDto) {
    return this.finance.returnAccountableAdvance(id, dto, user.customerId);
  }

  @Post('accountable-advances/:id/reimburse')
  @RequirePermission('finance', 'pay')
  reimburseAccountableAdvance(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: CloseAccountableAdvanceDto) {
    return this.finance.reimburseAccountableAdvance(id, dto, user.customerId);
  }

  @Post('periods/:period/close')
  @RequirePermission('finance', 'approve')
  closePeriod(@CurrentUser() user: AuthPrincipal, @Param('period') period: string, @Body() dto: CloseAccountingPeriodDto) {
    return this.finance.closeAccountingPeriod(period, dto, user.customerId);
  }

  @Get('tax-periods/:period')
  @RequirePermission('finance', 'read')
  taxPeriod(@Param('period') period: string, @Query('point') point?: string) {
    return this.finance.taxPeriod(period, point);
  }

  @Post('tax-periods/:period/settle')
  @RequirePermission('finance', 'approve')
  settleTaxPeriod(@CurrentUser() user: AuthPrincipal, @Param('period') period: string, @Body() dto: SettleTaxPeriodDto) {
    return this.finance.settleTaxPeriod(period, dto, user.customerId);
  }

  @Get('ap-aging')
  @RequirePermission('finance', 'read')
  apAging(@Query() query: SupplierAgingQueryDto) {
    return this.finance.supplierAging(query);
  }

  @Get('ar-aging')
  @RequirePermission('finance', 'read')
  arAging(@Query() query: ArAgingQueryDto) {
    return this.finance.customerAging(query);
  }

  @Get('ar-aging/:id')
  @RequirePermission('finance', 'read')
  arAgingDocument(@Param('id') id: string, @Query() query: ArAgingQueryDto) {
    return this.finance.customerDebtDrilldown(id, query);
  }

  @Get('journal')
  @RequirePermission('finance', 'read')
  journal(@Query() query: FinanceAccountingQueryDto) {
    return this.finance.accountingJournal(query);
  }

  @Get('manual-adjustments')
  @RequirePermission('finance', 'read')
  manualAdjustments(@Query('status') status?: string) {
    return this.finance.listManualAdjustments(status);
  }

  @Post('manual-adjustments')
  @RequirePermission('finance', 'create')
  manualAdjustment(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateManualAdjustmentDto) {
    return this.finance.createManualAdjustment(dto, user.customerId);
  }

  @Get('journal/export')
  @RequirePermission('finance', 'read')
  async journalExport(@Query() query: FinanceAccountingQueryDto, @Res() response: Response) {
    const csv = await this.finance.accountingJournalExport(query);
    return response
      .status(200)
      .type('text/csv; charset=utf-8')
      .setHeader('Content-Disposition', 'attachment; filename="alistore-journal.csv"')
      .send(`\uFEFF${csv}`);
  }

  @Post('journal/:id/reverse')
  @RequirePermission('finance', 'approve')
  reverseJournal(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: ReverseAccountingEntryDto) {
    return this.finance.reverseAccountingEntry(id, dto, user.customerId);
  }

  @Get('trial-balance')
  @RequirePermission('finance', 'read')
  trialBalance(@Query() query: FinanceAccountingQueryDto) {
    return this.finance.trialBalance(query);
  }

  @Get('statements')
  @RequirePermission('finance', 'read')
  statements(@Query() query: FinanceAccountingQueryDto) {
    return this.finance.financialStatements(query);
  }

  @Get('budgets')
  @RequirePermission('finance', 'read')
  budgets(@Query() query: FinancePeriodQueryDto) {
    return this.finance.listBudgets(query.period, query.point);
  }

  @Post('budgets')
  @RequirePermission('finance', 'create')
  setBudget(@CurrentUser() user: AuthPrincipal, @Body() dto: SetFinanceBudgetDto) {
    return this.finance.setBudget(dto, user.customerId);
  }

  @Get('plan-fact')
  @RequirePermission('finance', 'read')
  planFact(@Query() query: FinancePeriodQueryDto) {
    return this.finance.planFact(query.period, query.point);
  }

  @Get('settlement-sources')
  @RequirePermission('finance', 'read')
  settlementSources(@Query() query: FinanceSettlementQueryDto) {
    return this.finance.settlementSources(query);
  }

  @Get('settlements')
  @RequirePermission('finance', 'read')
  settlements() {
    return this.finance.listSettlements();
  }

  @Post('settlements')
  @RequirePermission('finance', 'approve')
  createSettlement(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateFinanceSettlementDto) {
    return this.finance.createSettlement(dto, user.customerId);
  }

  @Post('settlements/:id/resolve')
  @RequirePermission('finance', 'approve')
  resolveSettlement(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: ResolveFinanceSettlementDto) {
    return this.finance.resolveSettlement(id, dto, user.customerId);
  }

  @Post('settlements/:id/close')
  @RequirePermission('finance', 'pay')
  closeSettlement(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: CloseFinanceSettlementDto) {
    return this.finance.closeSettlement(id, dto.idempotencyKey, user.customerId);
  }
}
