import { Module } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { ReceiptsController } from './receipts.controller';

/**
 * POS receipt rendering (receiptline). Exported so the POS/orders modules can
 * generate a receipt from a completed sale without re-implementing formatting.
 */
@Module({
  providers: [ReceiptsService],
  controllers: [ReceiptsController],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
