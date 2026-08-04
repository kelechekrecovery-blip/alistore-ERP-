import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiReadGuard } from './ai-read.decorator';
import { GradePhotosDto } from './grading.dto';
import { GradingService } from './grading.service';

/**
 * Каждый вызов стоит денег провайдера, а лимита не было ни на одном
 * AI-эндпоинте: vision + до 6 изображений — самый дорогой вызов.
 */
@ApiTags('ai')
@AiReadGuard()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('ai')
export class GradingController {
  constructor(private readonly grading: GradingService) {}

  @ApiOperation({
    summary: 'Фото-грейдинг Б/У устройства — keyless rules или vision/LLM при ключе',
    description:
      'Для реального vision-анализа передавайте photos[].url (http(s) или локальный /uploads-путь) — грейдинг читает пиксели. ' +
      'Резолв по evidenceId пока не поддержан: фото без url оцениваются по меткам/анкете, иначе — keyless rules.',
  })
  @ApiOkResponse({ description: '{ source, grade, confidence, defects, notes, recommendedChecks }.' })
  @Post('grade-photos')
  gradePhotos(@Body() dto: GradePhotosDto) {
    return this.grading.grade(dto);
  }
}
