import { Controller, UseGuards, Get } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiReadGuard } from './ai-read.decorator';
import { InsightsService } from './insights.service';

/**
 * Каждый вызов стоит денег провайдера, а лимита не было ни на одном
 * AI-эндпоинте: кокпит ERP открывают часто, но до 7 обращений к модели за вызов.
 */
@ApiTags('ai')
@AiReadGuard()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('ai')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @ApiOperation({ summary: 'Owner AI assistant — insights derived from the Event Ledger' })
  @ApiOkResponse({ description: '{ source, insights[] } — keyless rule engine (LLM when a key is set).' })
  @Get('insights')
  get() {
    return this.insights.insights();
  }
}
