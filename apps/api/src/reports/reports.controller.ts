import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { requireActiveStaff } from '../auth/staff-principal';
import { BlindCashReadGuard } from '../auth/blind-cash-read.guard';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, BlindCashReadGuard, PermissionGuard)
@RequirePermission('reports', 'read')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly staffAuth: StaffAuthService,
  ) {}

  @ApiOperation({ summary: 'Owner dashboard KPIs (money, orders, stock, ops)' })
  @ApiOkResponse({ description: 'Aggregated metrics from the Event Ledger tables.' })
  @Get('dashboard')
  async dashboard(@CurrentUser() user: AuthPrincipal) {
    const staffId = await requireActiveStaff(user, this.staffAuth);
    return this.reports.dashboard(staffId);
  }

  @ApiOperation({ summary: 'Owner KPIs — gross margin, average check, top products' })
  @ApiOkResponse({ description: 'Margin/COGS/avg-check derived from ledger-backed tables.' })
  @Get('kpi')
  kpi() {
    return this.reports.kpi();
  }

  @ApiOperation({ summary: 'Daily revenue buckets for the last N days (default 7, max 90)' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  @ApiOkResponse({ description: 'One {day, amount} bucket per day, oldest first.' })
  @Get('revenue')
  revenue(@Query('days') days?: string) {
    return this.reports.revenue(days ? Number(days) : 7);
  }

  @ApiOperation({ summary: 'Revenue for an arbitrary date range (from & to, YYYY-MM-DD, inclusive)' })
  @ApiQuery({ name: 'from', required: true, example: '2026-06-01' })
  @ApiQuery({ name: 'to', required: true, example: '2026-06-30' })
  @ApiOkResponse({ description: '{ from, to, days, total, buckets[] }.' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid date/range.' })
  @Get('revenue-range')
  revenueRange(@Query('from') from: string, @Query('to') to: string) {
    return this.reports.revenueRange(from, to);
  }

  @ApiOperation({ summary: 'Revenue trend — last N days vs the previous N days (default 7)' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  @ApiOkResponse({ description: '{ current, previous, deltaPct, direction }.' })
  @Get('revenue-trend')
  revenueTrend(@Query('days') days?: string) {
    return this.reports.revenueTrend(days ? Number(days) : 7);
  }

  @ApiOperation({ summary: 'Seller payroll — base + commission on turnover, per seller' })
  @ApiOkResponse({ description: 'Advisory pay per seller from ledger-backed payments.' })
  @Get('payroll')
  payroll() {
    return this.reports.payroll();
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
