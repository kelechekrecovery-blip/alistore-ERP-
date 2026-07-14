import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CreateExpenseDto, FinancePeriodQueryDto, PayExpenseDto, RejectExpenseDto, SetFinanceBudgetDto } from './finance.dto';
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
    return this.finance.pay(id, dto.idempotencyKey, user.customerId);
  }
}

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller('finance')
export class FinancePlanningController {
  constructor(private readonly finance: FinanceService) {}

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
}
