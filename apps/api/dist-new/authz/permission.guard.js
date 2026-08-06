"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const authz_service_1 = require("./authz.service");
const require_permission_decorator_1 = require("./require-permission.decorator");
let PermissionGuard = class PermissionGuard {
    constructor(reflector, authz) {
        this.reflector = reflector;
        this.authz = authz;
    }
    async canActivate(context) {
        const required = this.reflector.getAllAndOverride(require_permission_decorator_1.PERMISSION_KEY, [context.getHandler(), context.getClass()]);
        if (!required)
            return true;
        const request = context
            .switchToHttp()
            .getRequest();
        const role = request.user?.role;
        if (!role || !(await this.authz.can(role, required.resource, required.action))) {
            throw new common_1.ForbiddenException('Недостаточно прав для этого действия');
        }
        return true;
    }
};
exports.PermissionGuard = PermissionGuard;
exports.PermissionGuard = PermissionGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        authz_service_1.AuthzService])
], PermissionGuard);
//# sourceMappingURL=permission.guard.js.map