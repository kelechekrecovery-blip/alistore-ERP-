import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { ApprovalsService } from '../approvals/approvals.service';
import { BlindCashReadGuard } from '../auth/blind-cash-read.guard';
import { AiReadGuard } from './ai-read.decorator';
import { buildReorderDraft } from './reorder-draft';
import { ReorderService } from './reorder.service';

export class ReorderDraftApprovalDto {
  @IsString() @MinLength(3) @MaxLength(128) idempotencyKey!: string;
  @IsString() @MaxLength(64) supplierId!: string;
  @IsString() @MaxLength(100) location!: string;
  @IsObject() unitCosts!: Record<string, number>;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

@ApiTags('ai')
@AiReadGuard()
@Controller('ai')
export class ReorderController {
  constructor(
    private readonly reorder: ReorderService,
    private readonly approvals: ApprovalsService,
  ) {}

  @ApiOperation({ summary: 'Рекомендации по закупкам — правила спрос/остаток (keyless, read-only)' })
  @ApiOkResponse({ description: '{ source, generatedForCount, needsReorder, reviews[] }.' })
  @Get('reorder')
  review() {
    return this.reorder.review();
  }

  @Post('reorder/draft-approval')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, BlindCashReadGuard, PermissionGuard)
  @RequirePermission('procurement', 'create')
  @ApiOperation({ summary: 'Создать approval-заявку на закупочный draft из свежей reorder-рекомендации' })
  requestDraftApproval(@CurrentUser() user: AuthPrincipal, @Body() dto: ReorderDraftApprovalDto) {
    return this.reorder.review().then((report) => {
      const draft = buildReorderDraft({
        idempotencyKey: dto.idempotencyKey,
        supplierId: dto.supplierId,
        location: dto.location,
        unitCosts: dto.unitCosts,
        reviews: report.reviews,
      });
      return this.approvals.request({
        action: 'procurement_draft',
        requester: user.customerId,
        reason: dto.reason?.trim() || 'AI reorder recommendation requires procurement approval',
        payload: draft as unknown as Record<string, unknown>,
        evidence: { source: 'ai.reorder', generatedForCount: report.generatedForCount, needsReorder: report.needsReorder },
        idempotencyKey: draft.idempotencyKey,
        sourceRef: 'ai.reorder',
      });
    });
  }
}
