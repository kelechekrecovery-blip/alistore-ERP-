import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { UnitsModule } from './units/units.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { CatalogModule } from './catalog/catalog.module';
import { ShiftsModule } from './shifts/shifts.module';
import { CourierModule } from './courier/courier.module';
import { ReservationsModule } from './reservations/reservations.module';
import { CustomersModule } from './customers/customers.module';
import { AuthModule } from './auth/auth.module';
import { OutboxModule } from './outbox/outbox.module';
import { PosModule } from './pos/pos.module';
import { MediaModule } from './media/media.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    UnitsModule,
    OrdersModule,
    PaymentsModule,
    CatalogModule,
    ShiftsModule,
    CourierModule,
    ReservationsModule,
    CustomersModule,
    AuthModule,
    OutboxModule,
    PosModule,
    MediaModule,
  ],
})
export class AppModule {}
