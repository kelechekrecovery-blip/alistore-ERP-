import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import {
  CampaignConversionDto,
  CreateCampaignDto,
  RecordCampaignSpendDto,
  SegmentRulesDto,
  UpdateCampaignDto,
} from './campaigns.dto';
import { CampaignsService } from './campaigns.service';

@ApiTags('campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @ApiOperation({ summary: 'Preview a consent-filtered segment audience' })
  @ApiOkResponse({ description: 'Audience counts and eligible customers.' })
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('campaigns', 'read')
  preview(@Body() dto: SegmentRulesDto) {
    return this.campaigns.preview(dto);
  }

  @ApiOperation({ summary: 'Create a campaign draft; no delivery is queued before approval and activation' })
  @ApiCreatedResponse({ description: 'Campaign draft created.' })
  @Post()
  @RequirePermission('campaigns', 'create')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(dto, user.customerId);
  }

  @Post(':id/update')
  @RequirePermission('campaigns', 'update')
  update(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.update(id, dto, user.customerId);
  }

  @Post(':id/submit')
  @RequirePermission('campaigns', 'submit')
  submit(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.campaigns.submit(id, user.customerId);
  }

  @Post(':id/activate')
  @RequirePermission('campaigns', 'activate')
  activate(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.campaigns.activate(id, user.customerId);
  }

  @Post(':id/pause')
  @RequirePermission('campaigns', 'pause')
  pause(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.campaigns.pause(id, user.customerId);
  }

  @Post(':id/complete')
  @RequirePermission('campaigns', 'complete')
  complete(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.campaigns.complete(id, user.customerId);
  }

  @Post(':id/spend')
  @RequirePermission('campaigns', 'reconcile')
  recordSpend(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: RecordCampaignSpendDto,
  ) {
    return this.campaigns.recordSpend(id, dto, user.customerId);
  }

  @ApiOperation({ summary: 'List campaigns with ROI metrics' })
  @ApiOkResponse({ description: 'Campaign list.' })
  @Get()
  @RequirePermission('campaigns', 'read')
  list() {
    return this.campaigns.list();
  }

  @ApiOperation({ summary: 'Campaign ROI from ledger-backed conversions and received payments' })
  @ApiOkResponse({ description: 'ROI metrics.' })
  @Get(':id/roi')
  @RequirePermission('campaigns', 'read')
  roi(@Param('id') id: string) {
    return this.campaigns.roiFor(id);
  }

  @ApiOperation({ summary: 'Attribute an order to a campaign once (campaign.converted)' })
  @ApiOkResponse({ description: 'Updated ROI metrics.' })
  @Post(':id/conversions')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('campaigns', 'convert')
  convert(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: CampaignConversionDto,
  ) {
    return this.campaigns.recordConversion(id, dto.orderId, user.customerId);
  }
}
