import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CreateStaffTaskDto, UpdateMyStaffTaskDto } from './staff-tasks.dto';
import { StaffTasksService } from './staff-tasks.service';

@ApiTags('staff-tasks')
@ApiBearerAuth()
@Controller('staff-tasks')
@UseGuards(JwtAuthGuard, ActiveStaffGuard)
export class StaffTasksController {
  constructor(private readonly tasks: StaffTasksService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthPrincipal) { return this.tasks.mine(user.customerId); }

  @Patch('mine/:id')
  updateMine(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: UpdateMyStaffTaskDto) {
    return this.tasks.updateMine(id, dto.status, user.customerId);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('staff_tasks', 'manage')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateStaffTaskDto) {
    return this.tasks.create(dto, user.customerId);
  }
}
