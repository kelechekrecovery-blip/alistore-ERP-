import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';

@Module({
  imports: [SettingsModule, RateLimitModule, StaffAuthModule, AuthzModule],
  providers: [CustomersService],
  controllers: [CustomersController],
  exports: [CustomersService],
})
export class CustomersModule {}
