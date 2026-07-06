import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CourierService } from './courier.service';
import { CreateRunDto, FailDeliveryDto, HandoverDto } from './courier.dto';

const SYSTEM_ACTOR = 'system';

@ApiTags('courier')
@Controller('courier')
export class CourierController {
  constructor(private readonly courier: CourierService) {}

  @ApiOperation({ summary: 'Get a courier run' })
  @ApiParam({ name: 'id', description: 'Courier run id' })
  @ApiOkResponse({ description: 'Run found.' })
  @ApiNotFoundResponse({ description: 'Run does not exist.' })
  @Get('runs/:id')
  async getRun(@Param('id') id: string) {
    const run = await this.courier.getRun(id);
    if (!run) throw new NotFoundException(`Курьерский рейс ${id} не найден`);
    return run;
  }

  @ApiOperation({ summary: 'Assign a courier run with its COD total (delivery.assigned)' })
  @ApiCreatedResponse({ description: 'Run created.' })
  @Post('runs')
  createRun(@Body() dto: CreateRunDto) {
    return this.courier.createRun(dto, SYSTEM_ACTOR);
  }

  @ApiOperation({
    summary: 'Courier hands over collected COD with reconciliation (cash.handover)',
  })
  @ApiOkResponse({ description: 'COD reconciled; run marked handed over.' })
  @ApiConflictResponse({ description: 'COD already handed over.' })
  @ApiUnprocessableEntityResponse({
    description: 'Unknown run, or a discrepancy with no reason (invariant #4).',
  })
  @Post('handover')
  handover(@Body() dto: HandoverDto) {
    return this.courier.handover(dto, SYSTEM_ACTOR);
  }
}
