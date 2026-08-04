import { Module } from '@nestjs/common';
import { ExchangesService } from './exchanges.service';
import { ExchangesController } from './exchanges.controller';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';
import { UnitsModule } from '../units/units.module';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [StaffAuthModule, AuthzModule, UnitsModule, OutboxModule],
  providers: [ExchangesService],
  controllers: [ExchangesController],
  exports: [ExchangesService],
})
export class ExchangesModule {}
