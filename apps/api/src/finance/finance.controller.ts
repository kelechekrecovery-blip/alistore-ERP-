import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CloseAccountingPeriodDto, CloseFinanceSettlementDto, CreateCashIncassationDto, CreateExpenseDto, CreateFinanceSettlementDto, FinanceAccountingQueryDto, FinancePeriodQueryDto, FinanceSettlementQueryDto, PayExpenseDto, RejectExpenseDto, ResolveFinanceSettlementDto, ReverseAccountingEntryDto, SetFinanceBudgetDto, SupplierAgingQueryDto } from './finance.dto';
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

  @Post('periods/:period/close')
  @RequirePermission('finance', 'approve')
  closePeriod(@CurrentUser() user: AuthPrincipal, @Param('period') period: string, @Body() dto: CloseAccountingPeriodDto) {
    return this.finance.closeAccountingPeriod(period, dto, user.customerId);
  }

  @Get('ap-aging')
  @RequirePermission('finance', 'read')
  apAging(@Query() query: SupplierAgingQueryDto) {
    return this.finance.supplierAging(query);
  }

  @Get('journal')
  @RequirePermission('finance', 'read')
  journal(@Query() query: FinanceAccountingQueryDto) {
    return this.finance.accountingJournal(query);
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
