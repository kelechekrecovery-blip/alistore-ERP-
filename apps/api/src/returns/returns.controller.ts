import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ReturnsService } from './returns.service';
import { CreateReturnDto, ReturnStatusDto } from './returns.dto';

const SYSTEM_ACTOR = 'system';

@ApiTags('returns')
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @ApiOperation({ summary: 'List returns by status' })
  @ApiOkResponse({ description: 'Returns, newest first.' })
  @Get()
  list(@Query('status') status?: string) {
    return this.returns.list(status);
  }

  @ApiOperation({ summary: 'Get a return' })
  @ApiNotFoundResponse({ description: 'Return does not exist.' })
  @Get(':id')
  async get(@Param('id') id: string) {
    const ret = await this.returns.get(id);
    if (!ret) throw new NotFoundException(`Возврат ${id} не найден`);
    return ret;
  }

  @ApiOperation({ summary: 'Open a return request (return.requested)' })
  @ApiCreatedResponse({ description: 'Return created.' })
  @Post()
  create(@Body() dto: CreateReturnDto) {
    return this.returns.request(dto.orderId, dto.reason, dto.requester ?? SYSTEM_ACTOR);
  }

  @ApiOperation({ summary: 'Advance a return through its status machine' })
  @ApiOkResponse({ description: 'Return status updated.' })
  @Patch(':id')
  transition(@Param('id') id: string, @Body() dto: ReturnStatusDto) {
    return this.returns.transition(id, dto.status, SYSTEM_ACTOR);
  }
}
