import { Module } from '@nestjs/common';
import { PosService } from './pos.service';
import { PosController } from './pos.controller';
import { CustomersModule } from '../customers/customers.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { UnitsModule } from '../units/units.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';

@Module({
  imports: [
    CustomersModule,
    ShiftsModule,
    UnitsModule,
    OrdersModule,
    PaymentsModule,
    ApprovalsModule,
    StaffAuthModule,
    AuthzModule,
  ],
  providers: [PosService],
  controllers: [PosController],
})
export class PosModule {}
