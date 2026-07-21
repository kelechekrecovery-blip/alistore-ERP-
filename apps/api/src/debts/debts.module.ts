import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { DebtsService } from './debts.service';
import { DebtsController } from './debts.controller';
import { ApprovalsModule } from '../approvals/approvals.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';
import { OutboxModule } from '../outbox/outbox.module';
import { DebtsReminderScheduler } from './debts.scheduler';

@Module({
  imports: [SettingsModule, ApprovalsModule, StaffAuthModule, AuthzModule, OutboxModule],
  providers: [DebtsService, DebtsReminderScheduler],
  controllers: [DebtsController],
  exports: [DebtsService],
})
export class DebtsModule {}
