import { Module } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { ReservationsScheduler } from './reservations.scheduler';
import { UnitsModule } from '../units/units.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ExchangesModule } from '../exchanges/exchanges.module';

/**
 * Reservation lifecycle (invariant #7). AuditService is provided globally; the
 * module imports UnitsModule to release held units and OutboxModule to notify the
 * customer that an expired hold was released.
 */
@Module({
  imports: [UnitsModule, OutboxModule, ExchangesModule],
  providers: [ReservationsService, ReservationsScheduler],
  exports: [ReservationsService],
})
export class ReservationsModule {}
