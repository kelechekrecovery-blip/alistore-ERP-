import { Module } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { ReservationsScheduler } from './reservations.scheduler';
import { UnitsModule } from '../units/units.module';

/**
 * Reservation lifecycle (invariant #7). AuditService is provided globally, so
 * only UnitsModule needs importing to release held units back to stock.
 */
@Module({
  imports: [UnitsModule],
  providers: [ReservationsService, ReservationsScheduler],
  exports: [ReservationsService],
})
export class ReservationsModule {}
