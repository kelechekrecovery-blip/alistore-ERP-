import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiReadGuard } from './ai-read.decorator';
import { suggestCategory } from './categorize';
import { CategorizeDto } from './categorize.dto';

@ApiTags('ai')
@AiReadGuard()
@Controller('ai')
export class CategorizeController {
  @ApiOperation({ summary: 'Авто-категоризация товара — правила по ключевым словам (keyless)' })
  @ApiOkResponse({ description: '{ category, confidence, matched, alternatives }.' })
  @Post('categorize')
  categorize(@Body() dto: CategorizeDto) {
    return suggestCategory(dto.name, dto.attrs ?? {});
  }
}
