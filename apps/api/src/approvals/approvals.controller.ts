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
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { Role } from '../rbac/permissions';
import { StaffAuthService } from '../staff-auth/staff-auth.service';

@ApiTags('approvals')
@Controller('approvals')
export class ApprovalsController {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly staffAuth: StaffAuthService,
  ) {}

  @ApiOperation({ summary: 'List approvals (default: pending) — Approval Inbox' })
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Approvals, newest first.' })
  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthPrincipal, @Query('status') status?: string) {
    this.assertStaff(user);
    return this.approvals.list(status ?? 'requested');
  }

  @ApiOperation({ summary: 'Get an approval' })
  @ApiBearerAuth()
  @ApiNotFoundResponse({ description: 'Approval does not exist.' })
  @Get(':id')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async decide(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: DecideApprovalDto) {
    this.assertStaff(user);
    if (dto.status === 'approved') {
      await this.staffAuth.verifyStepUp(user.customerId, dto.totpToken);
    }
    return this.approvals.decide(id, {
      status: dto.status,
      approver: user.customerId,
      approverRole: user.role as Role,
      reason: dto.reason,
    });
  }

  private assertStaff(user: AuthPrincipal) {
    if (user.typ !== 'staff' || !user.role) {
      throw new ForbiddenException('Требуется staff JWT');
    }
  }
}
