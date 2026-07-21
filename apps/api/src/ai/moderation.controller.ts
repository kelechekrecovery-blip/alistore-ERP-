import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { AiReadGuard } from './ai-read.decorator';
import { ModerationService } from './moderation.service';

export class ModerateDto {
  @IsString()
  text!: string;
}

/**
 * Каждый вызов стоит денег провайдера, а лимита не было ни на одном
 * AI-эндпоинте: зовётся из пользовательских путей (отзывы, CMS).
 */
@ApiTags('ai')
@AiReadGuard()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('ai')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @ApiOperation({ summary: 'Модерация текста (отзывы/CMS) — стоп-слова (keyless) или LLM-классификатор при ключе' })
  @ApiOkResponse({ description: '{ allowed, categories, reason, source }.' })
  @Post('moderate')
  moderate(@Body() dto: ModerateDto) {
    return this.moderation.moderate(dto.text);
  }
}
