import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';

/**
 * Health checks (@nestjs/terminus): GET /health readiness (DB ping + heap),
 * GET /health/live liveness — both public, for orchestrators / uptime probes.
 * GET /health/integrations is staff-only (it lists which integrations are still
 * unconfigured), so staff auth and the permission engine are wired in here.
 */
@Module({
  imports: [ConfigModule, TerminusModule, StaffAuthModule, AuthzModule],
  controllers: [HealthController],
})
export class HealthModule {}
