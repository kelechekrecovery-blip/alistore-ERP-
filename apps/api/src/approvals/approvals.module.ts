import { Module } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';
import { ExchangesModule } from '../exchanges/exchanges.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';

@Module({
  imports: [StaffAuthModule, ExchangesModule],
  providers: [ApprovalsService],
  controllers: [ApprovalsController],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
