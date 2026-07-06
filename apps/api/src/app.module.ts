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
import { ReceiptsModule } from './receipts/receipts.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { ReturnsModule } from './returns/returns.module';
import { LabelsModule } from './labels/labels.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { ReportsModule } from './reports/reports.module';
import { ExchangesModule } from './exchanges/exchanges.module';
import { WarrantyModule } from './warranty/warranty.module';

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
    ReceiptsModule,
    ApprovalsModule,
    ReturnsModule,
    LabelsModule,
    ProductsModule,
    InventoryModule,
    ReportsModule,
    ExchangesModule,
    WarrantyModule,
  ],
})
export class AppModule {}
