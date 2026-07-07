import { Module } from '@nestjs/common';
import { DebtsService } from './debts.service';
import { DebtsController } from './debts.controller';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [ApprovalsModule],
  providers: [DebtsService],
  controllers: [DebtsController],
  exports: [DebtsService],
})
export class DebtsModule {}
