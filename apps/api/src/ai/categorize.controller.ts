import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiReadGuard } from './ai-read.decorator';
import { CategorizeService } from './categorize.service';
import { CategorizeDto } from './categorize.dto';

@ApiTags('ai')
@AiReadGuard()
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
