import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthzModule } from '../authz/authz.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';

@Module({
  imports: [PrismaModule, AuditModule, AuthzModule, StaffAuthModule],
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
