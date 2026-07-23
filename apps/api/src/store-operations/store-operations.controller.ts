import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { StoreOperationsService } from './store-operations.service';
import { CreateStoreChecklistDto, CreateStoreIncidentDto, ResolveStoreIncidentDto, StoreOperationsQueryDto, UpdateChecklistItemDto } from './store-operations.dto';

@ApiTags('store-operations')
@ApiBearerAuth()
@Controller('store-operations')
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
export class StoreOperationsController {
  constructor(private readonly operations: StoreOperationsService) {}

  /**
   * Scoped to the caller's own point: `store_operations:read` is held by every
   * role standing in a store, and an unfiltered overview used to return the
   * whole network's checklists and free-text incidents. admin/owner may still
   * ask for another point explicitly.
   */
  @Get('overview')
  @RequirePermission('store_operations', 'read')
  overview(@CurrentUser() user: AuthPrincipal, @Query() query: StoreOperationsQueryDto) { return this.operations.overview(query, user); }

  @Post('checklists')
  @RequirePermission('store_operations', 'manage')
  createChecklist(@CurrentUser() user: AuthPrincipal, @Headers('idempotency-key') key: string | undefined, @Body() dto: CreateStoreChecklistDto) { return this.operations.createChecklist(dto, user.customerId, key); }

  @Post('checklists/:id/items/:code')
  @RequirePermission('store_operations', 'manage')
  updateItem(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Param('code') code: string, @Headers('idempotency-key') key: string | undefined, @Body() dto: UpdateChecklistItemDto) { return this.operations.updateItem(id, code, dto, user.customerId, key); }

  @Post('checklists/:id/complete')
  @RequirePermission('store_operations', 'manage')
  completeChecklist(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined) { return this.operations.completeChecklist(id, user.customerId, key); }

  @Post('incidents')
  @RequirePermission('store_operations', 'manage')
  createIncident(@CurrentUser() user: AuthPrincipal, @Headers('idempotency-key') key: string | undefined, @Body() dto: CreateStoreIncidentDto) { return this.operations.createIncident(dto, user.customerId, key); }

  @Post('incidents/:id/resolve')
  @RequirePermission('store_operations', 'resolve')
  resolveIncident(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() dto: ResolveStoreIncidentDto) { return this.operations.resolveIncident(id, dto, user.customerId, key); }
}
