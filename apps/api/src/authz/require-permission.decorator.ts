import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'authz:permission';

export interface RequiredPermission {
  resource: string;
  action: string;
}

/** Mark a handler as requiring `action` on `resource` (checked by PermissionGuard). */
export const RequirePermission = (resource: string, action: string) =>
  SetMetadata(PERMISSION_KEY, { resource, action } satisfies RequiredPermission);
