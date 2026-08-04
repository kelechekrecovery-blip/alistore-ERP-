import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiAcceptedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CampaignFunnelDto } from './attribution.dto';
import { CampaignAttributionService } from './campaign-attribution.service';

@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignTrackingController {
  constructor(private readonly attribution: CampaignAttributionService) {}

  @ApiOperation({ summary: 'Record a privacy-safe campaign click or storefront visit' })
  @ApiAcceptedResponse({ description: 'Event accepted; unknown or replayed facts do not create rows.' })
  @Post('funnel')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  track(@Body() dto: CampaignFunnelDto) {
    return this.attribution.trackPublic(dto);
  }
}
