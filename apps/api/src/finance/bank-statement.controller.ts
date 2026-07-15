import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { FinanceService } from './finance.service';
import { ImportBankStatementDto, ReconcileBankStatementLineDto } from './finance.dto';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller('finance/bank-statements')
export class BankStatementController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  @RequirePermission('finance', 'read')
  list(@Query('accountCode') accountCode?: string) {
    return this.finance.listBankStatements(accountCode);
  }

  @Post()
  @RequirePermission('finance', 'create')
  import(@CurrentUser() user: AuthPrincipal, @Body() dto: ImportBankStatementDto) {
    return this.finance.importBankStatement(dto, user.customerId);
  }

  @Post('lines/:id/reconcile')
  @RequirePermission('finance', 'approve')
  reconcile(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: ReconcileBankStatementLineDto) {
    return this.finance.reconcileBankStatementLine(id, dto, user.customerId);
  }
}
