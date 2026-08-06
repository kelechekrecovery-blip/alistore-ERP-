import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthzService } from './authz.service';
export declare class PermissionGuard implements CanActivate {
    private readonly reflector;
    private readonly authz;
    constructor(reflector: Reflector, authz: AuthzService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
