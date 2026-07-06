import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Body,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApprovalsService } from './approvals.service';
import { DecideApprovalDto } from './approvals.dto';

@ApiTags('approvals')
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @ApiOperation({ summary: 'List approvals (default: pending) — Approval Inbox' })
  @ApiOkResponse({ description: 'Approvals, newest first.' })
  @Get()
  list(@Query('status') status?: string) {
    return this.approvals.list(status ?? 'requested');
  }

  @ApiOperation({ summary: 'Get an approval' })
  @ApiNotFoundResponse({ description: 'Approval does not exist.' })
  @Get(':id')
  async get(@Param('id') id: string) {
    const approval = await this.approvals.get(id);
    if (!approval) throw new NotFoundException(`Approval ${id} не найден`);
    return approval;
  }

  @ApiOperation({ summary: 'Approve (executes the parked action) or reject' })
  @ApiOkResponse({ description: 'Decision recorded; action executed on approve.' })
  @ApiConflictResponse({ description: 'Approval already decided.' })
  @Patch(':id/decide')
  decide(@Param('id') id: string, @Body() dto: DecideApprovalDto) {
    return this.approvals.decide(id, dto);
  }
}
