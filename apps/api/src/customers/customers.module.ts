import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';

@Module({
  imports: [RateLimitModule, StaffAuthModule],
  providers: [CustomersService],
  controllers: [CustomersController],
  exports: [CustomersService],
})
export class CustomersModule {}
