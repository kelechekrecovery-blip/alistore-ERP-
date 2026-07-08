import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

/**
 * Health checks (@nestjs/terminus): GET /health readiness (DB ping + heap),
 * GET /health/live liveness, GET /health/integrations external readiness.
 * Public — for orchestrators / uptime probes.
 */
@Module({
  imports: [ConfigModule, TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
