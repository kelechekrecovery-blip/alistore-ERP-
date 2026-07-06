import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
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
import { ShiftsService } from './shifts.service';
import { CloseShiftDto, OpenShiftDto } from './shifts.dto';

const SYSTEM_ACTOR = 'system';

@ApiTags('shifts')
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @ApiOperation({ summary: "Staff member's currently open shift (or null)" })
  @ApiOkResponse({ description: 'Open shift or null.' })
  @Get('current')
  current(@Query('staffId') staffId: string) {
    return this.shifts.currentOpen(staffId);
  }

  @ApiOperation({ summary: 'Get a cash shift with its payments' })
  @ApiParam({ name: 'id', description: 'Cash shift id' })
  @ApiOkResponse({ description: 'Shift found.' })
  @ApiNotFoundResponse({ description: 'Shift does not exist.' })
  @Get(':id')
  async get(@Param('id') id: string) {
    const shift = await this.shifts.get(id);
    if (!shift) throw new NotFoundException(`Смена ${id} не найдена`);
    return shift;
  }

  @ApiOperation({ summary: 'Open a cash shift (shift.opened)' })
  @ApiCreatedResponse({ description: 'Shift opened.' })
  @ApiConflictResponse({ description: 'Staff already has an open shift.' })
  @Post('open')
  open(@Body() dto: OpenShiftDto) {
    return this.shifts.open(dto, SYSTEM_ACTOR);
  }

  @ApiOperation({
    summary: 'Close a cash shift with drawer reconciliation (shift.closed / cash.shortage)',
  })
  @ApiParam({ name: 'id', description: 'Cash shift id' })
  @ApiOkResponse({ description: 'Shift closed; diff recorded.' })
  @ApiConflictResponse({ description: 'Shift already closed.' })
  @ApiUnprocessableEntityResponse({
    description: 'Unknown shift, or a discrepancy with no reason (invariant #3).',
  })
  @Post(':id/close')
  close(@Param('id') id: string, @Body() dto: CloseShiftDto) {
    return this.shifts.close(id, dto, SYSTEM_ACTOR);
  }
}
