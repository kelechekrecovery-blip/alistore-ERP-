import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ReportsModule } from '../reports/reports.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { SupportModule } from '../support/support.module';
import { TelegramAgentController } from './telegram-agent.controller';
import { TelegramAgentRetentionService } from './telegram-agent-retention.service';
import { TelegramAgentService } from './telegram-agent.service';

@Module({
  imports: [
    ApprovalsModule,
    AuthModule,
    AuthzModule,
    OutboxModule,
    RateLimitModule,
    ReportsModule,
    StaffAuthModule,
    SupportModule,
  ],
  controllers: [TelegramAgentController],
  providers: [TelegramAgentService, TelegramAgentRetentionService],
  exports: [TelegramAgentService],
})
export class TelegramAgentModule {}
