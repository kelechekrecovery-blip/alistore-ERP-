import { Module } from '@nestjs/common';
import { AuthzService } from './authz.service';
import { PermissionGuard } from './permission.guard';

/**
 * Authorization (casbin Role Permission Matrix). Exports AuthzService +
 * PermissionGuard so any module can guard dangerous actions with
 * @RequirePermission once staff auth supplies a role.
 */
@Module({
  providers: [AuthzService, PermissionGuard],
  exports: [AuthzService, PermissionGuard],
})
export class AuthzModule {}
