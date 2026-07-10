import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { ProtectionController } from './protection.controller';
import { ProtectionService } from './protection.service';

@Module({
  imports: [AuthModule, StaffAuthModule, AuthzModule, RateLimitModule],
  controllers: [ProtectionController],
  providers: [ProtectionService],
})
export class ProtectionModule {}
