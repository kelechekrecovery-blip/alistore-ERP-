import { Module } from '@nestjs/common';
import { TradeInsController } from './tradeins.controller';
import { TradeInsService } from './tradeins.service';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';

@Module({
  imports: [StaffAuthModule, AuthzModule],
  controllers: [TradeInsController],
  providers: [TradeInsService],
  exports: [TradeInsService],
})
export class TradeInsModule {}
