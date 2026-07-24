import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

/**
 * First-party storefront funnel. Ingestion is public and throttled
 * (RateLimitModule); the service is exported so ReportsModule can serve the
 * owner-gated funnel read without duplicating the query.
 */
@Module({
  imports: [PrismaModule, RateLimitModule],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
