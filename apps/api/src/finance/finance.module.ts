import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { FinanceController, FinancePlanningController } from './finance.controller';
import { BankStatementController } from './bank-statement.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [StaffAuthModule, AuthzModule],
  controllers: [FinanceController, FinancePlanningController, BankStatementController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
