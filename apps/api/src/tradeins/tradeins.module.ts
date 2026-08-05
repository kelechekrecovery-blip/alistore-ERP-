import { Module } from '@nestjs/common';
import { TradeInsController } from './tradeins.controller';
import { TradeInsService } from './tradeins.service';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';
import { OutboxModule } from '../outbox/outbox.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [StaffAuthModule, AuthzModule, OutboxModule, SettingsModule],
  controllers: [TradeInsController],
  providers: [TradeInsService],
  exports: [TradeInsService],
})
export class TradeInsModule {}
