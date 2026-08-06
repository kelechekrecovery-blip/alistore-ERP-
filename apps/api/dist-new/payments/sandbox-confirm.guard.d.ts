import { CanActivate } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class SandboxConfirmGuard implements CanActivate {
    private readonly config;
    constructor(config: ConfigService);
    canActivate(): boolean;
}
