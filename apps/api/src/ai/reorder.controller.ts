import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiReadGuard } from './ai-read.decorator';
import { ReorderService } from './reorder.service';

@ApiTags('ai')
@AiReadGuard()
@Controller('ai')
export class ReorderController {
  constructor(private readonly reorder: ReorderService) {}

  @ApiOperation({ summary: 'Рекомендации по закупкам — правила спрос/остаток (keyless, read-only)' })
  @ApiOkResponse({ description: '{ source, generatedForCount, needsReorder, reviews[] }.' })
  @Get('reorder')
  review() {
    return this.reorder.review();
  }
}
