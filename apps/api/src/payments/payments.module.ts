import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { UnitsModule } from '../units/units.module';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [UnitsModule, ApprovalsModule],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
