import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReorderService } from './reorder.service';

@ApiTags('ai')
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
