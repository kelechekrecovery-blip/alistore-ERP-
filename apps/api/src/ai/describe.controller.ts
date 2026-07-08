import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { AiReadGuard } from './ai-read.decorator';
import { DescribeService } from './describe.service';
import { DescribeDto } from './describe.dto';

@ApiTags('ai')
@AiReadGuard()
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
