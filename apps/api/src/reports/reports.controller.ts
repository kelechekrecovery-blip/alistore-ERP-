import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @ApiOperation({ summary: 'Owner dashboard KPIs (money, orders, stock, ops)' })
  @ApiOkResponse({ description: 'Aggregated metrics from the Event Ledger tables.' })
  @Get('dashboard')
  dashboard() {
    return this.reports.dashboard();
  }

  @ApiOperation({ summary: 'Risk Center — ranked risk signals' })
  @ApiOkResponse({ description: 'Discrepancies, outstanding COD, stale reservations, approvals.' })
  @Get('risks')
  risks() {
    return this.reports.risks();
  }

  @ApiOperation({ summary: 'Event Ledger feed (read-only)' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'ref', required: false })
  @ApiOkResponse({ description: 'Latest audit events, newest first.' })
  @Get('ledger')
  ledger(@Query('type') type?: string, @Query('ref') ref?: string) {
    return this.reports.ledger({ type, ref });
  }
}
