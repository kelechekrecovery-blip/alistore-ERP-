import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { B2BController } from './b2b.controller';
import { B2BService } from './b2b.service';

@Module({
  imports: [AuthModule, StaffAuthModule, AuthzModule, RateLimitModule],
  controllers: [B2BController],
  providers: [B2BService],
})
export class B2BModule {}
