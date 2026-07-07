import { Module } from '@nestjs/common';
import { TradeInsController } from './tradeins.controller';
import { TradeInsService } from './tradeins.service';

@Module({
  controllers: [TradeInsController],
  providers: [TradeInsService],
  exports: [TradeInsService],
})
export class TradeInsModule {}
