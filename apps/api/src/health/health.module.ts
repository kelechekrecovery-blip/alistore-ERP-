import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

/**
 * Health checks (@nestjs/terminus): GET /health readiness (DB ping + heap),
 * GET /health/live liveness. Public — for orchestrators / uptime probes.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
