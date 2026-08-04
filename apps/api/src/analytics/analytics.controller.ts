import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AnalyticsService } from './analytics.service';
import { TrackEventDto } from './analytics.dto';

/**
 * Public funnel ingestion. A browser posts here with no staff token, so it is
 * throttled (per the shared subject tracker) and its input is validated before
 * anything is written. Reading the funnel is elsewhere and owner-gated
 * (`GET /reports/funnel`).
 */
@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @ApiOperation({ summary: 'Record a storefront funnel event (public, throttled)' })
  @Post('events')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async track(@Body() dto: TrackEventDto): Promise<{ ok: true }> {
    await this.analytics.record(dto);
    return { ok: true };
  }
}
