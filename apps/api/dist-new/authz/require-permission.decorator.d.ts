export declare const PERMISSION_KEY = "authz:permission";
export interface RequiredPermission {
    resource: string;
    action: string;
}
export declare const RequirePermission: (resource: string, action: string) => import("@nestjs/common").CustomDecorator<string>;
