import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiReadGuard } from './ai-read.decorator';
import { CategorizeService } from './categorize.service';
import { CategorizeDto } from './categorize.dto';

/**
 * Каждый вызов стоит денег провайдера, а лимита не было ни на одном
 * AI-эндпоинте.
 */
@ApiTags('ai')
@AiReadGuard()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('ai')
export class CategorizeController {
  constructor(private readonly categorize: CategorizeService) {}

  @ApiOperation({ summary: 'Авто-категоризация товара — правила (keyless) или LLM-классификатор при ключе' })
  @ApiOkResponse({ description: '{ category, confidence, matched, alternatives }.' })
  @Post('categorize')
  categorizeProduct(@Body() dto: CategorizeDto) {
    return this.categorize.suggest(dto.name, dto.attrs ?? {});
  }
}
