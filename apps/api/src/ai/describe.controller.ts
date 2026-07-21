import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { AiReadGuard } from './ai-read.decorator';
import { DescribeService } from './describe.service';
import { DescribeDto } from './describe.dto';

/**
 * Каждый вызов стоит денег провайдера, а лимита не было ни на одном
 * AI-эндпоинте.
 */
@ApiTags('ai')
@AiReadGuard()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('ai')
export class DescribeController {
  constructor(private readonly describe: DescribeService) {}

  @ApiOperation({ summary: 'Сгенерировать описание карточки — шаблон (keyless) или LLM при ключе' })
  @ApiOkResponse({ description: '{ description, source, highlights }.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown SKU or missing name.' })
  @Post('describe')
  describeProduct(@Body() dto: DescribeDto) {
    return this.describe.describe(dto);
  }
}
