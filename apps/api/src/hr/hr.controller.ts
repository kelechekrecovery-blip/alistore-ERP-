import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CancelHrScheduleDto, CreateHrScheduleDto, DecideHrAbsenceDto, HrWeekQueryDto, OpenHrAttendanceDto, RequestHrAbsenceDto, UpdateHrScheduleDto } from './hr.dto';
import { HrService } from './hr.service';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr')
@UseGuards(JwtAuthGuard, ActiveStaffGuard)
export class HrController {
  constructor(private readonly hr: HrService) {}

  @Get('week')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr', 'read')
  week(@Query() query: HrWeekQueryDto) { return this.hr.week(query.weekStart, query.point); }

  @Get('me/week')
  myWeek(@CurrentUser() user: AuthPrincipal, @Query() query: HrWeekQueryDto) { return this.hr.week(query.weekStart, query.point, user.customerId); }

  @Post('schedules')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr', 'manage')
  createSchedule(@CurrentUser() user: AuthPrincipal, @Headers('idempotency-key') key: string | undefined, @Body() dto: CreateHrScheduleDto) {
    return this.hr.createSchedule(dto, user.customerId, key);
  }

  @Patch('schedules/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr', 'manage')
  updateSchedule(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() dto: UpdateHrScheduleDto) {
    return this.hr.updateSchedule(id, dto, user.customerId, key);
  }

  @Post('schedules/:id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr', 'manage')
  cancelSchedule(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() dto: CancelHrScheduleDto) {
    return this.hr.cancelSchedule(id, dto.reason, user.customerId, key);
  }

  @Post('me/attendance/open')
  openAttendance(@CurrentUser() user: AuthPrincipal, @Headers('idempotency-key') key: string | undefined, @Body() dto: OpenHrAttendanceDto) {
    return this.hr.openAttendance(dto.scheduleId, user.customerId, key);
  }

  @Post('me/attendance/close')
  closeAttendance(@CurrentUser() user: AuthPrincipal, @Headers('idempotency-key') key: string | undefined, @Body() dto: OpenHrAttendanceDto) {
    return this.hr.closeAttendance(dto.scheduleId, user.customerId, key);
  }

  @Post('me/absences')
  requestAbsence(@CurrentUser() user: AuthPrincipal, @Headers('idempotency-key') key: string | undefined, @Body() dto: RequestHrAbsenceDto) {
    return this.hr.requestAbsence(dto, user.customerId, key);
  }

  @Post('absences/:id/decide')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr', 'manage')
  decideAbsence(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: DecideHrAbsenceDto) {
    return this.hr.decideAbsence(id, dto.status, dto.note, user.customerId);
  }
}
