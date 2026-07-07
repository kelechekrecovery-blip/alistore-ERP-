import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PricingService } from './pricing.service';

@ApiTags('ai')
@Controller('ai')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @ApiOperation({ summary: 'Ценовые рекомендации по спросу/остатку — правила (keyless, read-only)' })
  @ApiOkResponse({ description: '{ source, generatedForCount, actionable, reviews[] }.' })
  @Get('pricing')
  review() {
    return this.pricing.review();
  }
}
