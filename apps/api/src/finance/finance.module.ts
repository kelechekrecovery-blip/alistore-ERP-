import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [StaffAuthModule, AuthzModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
