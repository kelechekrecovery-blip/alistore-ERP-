import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { AiReadGuard } from './ai-read.decorator';
import { PriceScoutDto } from './price-scout.dto';
import { PriceScoutService } from './price-scout.service';

/**
 * Каждый вызов стоит денег провайдера, а лимита не было ни на одном
 * AI-эндпоинте.
 */
@ApiTags('ai')
@AiReadGuard()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('ai')
export class PriceScoutController {
  constructor(private readonly priceScout: PriceScoutService) {}

  @ApiOperation({ summary: 'Разведка рыночной цены — keyless listings rules или LLM scout при ключе' })
  @ApiOkResponse({ description: '{ source, marketLow, marketMedian, marketHigh, recommendedPrice, confidence }.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown SKU or missing name/basePrice.' })
  @Post('price-scout')
  scout(@Body() dto: PriceScoutDto) {
    return this.priceScout.scout(dto);
  }
}
