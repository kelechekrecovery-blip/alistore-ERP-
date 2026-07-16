import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApprovalsService } from './approvals.service';
import { DecideApprovalDto } from './approvals.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { Role } from '../rbac/permissions';

@ApiTags('approvals')
@UseGuards(JwtAuthGuard, ActiveStaffGuard)
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @ApiOperation({ summary: 'List approvals (default: pending) — Approval Inbox' })
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Approvals, newest first.' })
  @Get()
  list(@CurrentUser() user: AuthPrincipal, @Query('status') status?: string) {
    this.assertStaff(user);
    return this.approvals.list(status ?? 'requested');
  }

  @ApiOperation({ summary: 'Get an approval' })
  @ApiBearerAuth()
  @ApiNotFoundResponse({ description: 'Approval does not exist.' })
  @Get(':id')
  async get(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    this.assertStaff(user);
    const approval = await this.approvals.get(id);
    if (!approval) throw new NotFoundException(`Approval ${id} не найден`);
    return approval;
  }

  @ApiOperation({ summary: 'Approve (executes the parked action) or reject' })
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Decision recorded; action executed on approve.' })
  @ApiConflictResponse({ description: 'Approval already decided.' })
  @Patch(':id/decide')
  async decide(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: DecideApprovalDto) {
    this.assertStaff(user);
    const input = {
      status: dto.status,
      approver: user.customerId,
      approverRole: user.role as Role,
      reason: dto.reason,
    };
    return dto.status === 'approved'
      ? this.approvals.decideWithStepUp(id, input, dto.totpToken)
      : this.approvals.decide(id, input);
  }

  private assertStaff(user: AuthPrincipal) {
    if (user.typ !== 'staff' || !user.role) {
      throw new ForbiddenException('Требуется staff JWT');
    }
  }
}
