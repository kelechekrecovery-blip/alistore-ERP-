import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { SupportService } from './support.service';
import { EscalateTicketDto, OpenTicketDto, TicketTransitionDto } from './support.dto';

const SYSTEM_ACTOR = 'system';

@ApiTags('support')
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @ApiOperation({ summary: 'Open a support ticket (SLA from priority, ticket.created)' })
  @ApiCreatedResponse({ description: 'Ticket opened.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown customer.' })
  @Post()
  open(@Body() dto: OpenTicketDto) {
    return this.support.open(dto, dto.actor ?? SYSTEM_ACTOR);
  }

  @ApiOperation({ summary: 'List tickets (filter by customerId/status), SLA-first' })
  @Get()
  list(@Query('customerId') customerId?: string, @Query('status') status?: string) {
    return this.support.list({ customerId, status });
  }

  @ApiOperation({ summary: 'Advance a ticket through its status machine' })
  @ApiOkResponse({ description: 'Ticket transitioned.' })
  @ApiConflictResponse({ description: 'Illegal transition.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown ticket.' })
  @Patch(':id/transition')
  transition(@Param('id') id: string, @Body() dto: TicketTransitionDto) {
    return this.support.transition(id, dto.to, dto, dto.actor ?? SYSTEM_ACTOR);
  }

  @ApiOperation({ summary: 'Escalate a ticket one priority step (ticket.escalated)' })
  @ApiOkResponse({ description: 'Ticket escalated.' })
  @ApiConflictResponse({ description: 'Ticket closed/resolved or already at max priority.' })
  @Patch(':id/escalate')
  escalate(@Param('id') id: string, @Body() dto: EscalateTicketDto) {
    return this.support.escalate(id, dto.actor ?? SYSTEM_ACTOR);
  }
}
