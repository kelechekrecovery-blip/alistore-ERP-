import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { FeatureFlagReasonDto, FeatureFlagStateDto, SetFeatureFlagDto } from './feature-flags.dto';
import { FeatureFlagsService } from './feature-flags.service';

@ApiTags('feature-flags')
@Controller('feature-flags')
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
export class FeatureFlagsController {
  constructor(private readonly featureFlags: FeatureFlagsService) {}

  @Get()
  @RequirePermission('reports', 'read')
  @ApiOperation({ summary: 'List evaluated server feature flags' })
  @ApiOkResponse({ type: FeatureFlagStateDto, isArray: true })
  list() {
    return this.featureFlags.list();
  }

  @Patch(':key')
  @RequirePermission('settings', 'manage')
  @ApiOperation({ summary: 'Create or replace an owner feature-flag override' })
  @ApiOkResponse({ type: FeatureFlagStateDto })
  set(
    @CurrentUser() user: AuthPrincipal,
    @Param('key') key: string,
    @Body() dto: SetFeatureFlagDto,
  ) {
    return this.featureFlags.set(
      key,
      dto.enabled,
      dto.reason,
      user.customerId,
      dto.expectedRevision,
    );
  }

  @Delete(':key')
  @RequirePermission('settings', 'manage')
  @ApiOperation({ summary: 'Reset a feature flag to environment/default evaluation' })
  @ApiOkResponse({ type: FeatureFlagStateDto })
  reset(
    @CurrentUser() user: AuthPrincipal,
    @Param('key') key: string,
    @Body() dto: FeatureFlagReasonDto,
  ) {
    return this.featureFlags.reset(key, dto.reason, user.customerId, dto.expectedRevision);
  }
}
