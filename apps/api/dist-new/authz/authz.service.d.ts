import { OnModuleInit } from '@nestjs/common';
export declare class AuthzService implements OnModuleInit {
    private enforcer;
    onModuleInit(): Promise<void>;
    init(): Promise<void>;
    can(role: string, resource: string, action: string): Promise<boolean>;
}
