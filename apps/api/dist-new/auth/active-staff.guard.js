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
exports.ActiveStaffGuard = void 0;
const common_1 = require("@nestjs/common");
const staff_auth_service_1 = require("../staff-auth/staff-auth.service");
let ActiveStaffGuard = class ActiveStaffGuard {
    constructor(staffAuth) {
        this.staffAuth = staffAuth;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (user?.typ !== 'staff' || !user.role) {
            throw new common_1.ForbiddenException('Требуется staff JWT');
        }
        const staff = await this.staffAuth.me(user.customerId);
        if (staff.role !== user.role) {
            throw new common_1.ForbiddenException('Роль сотрудника изменена. Войдите снова');
        }
        return true;
    }
};
exports.ActiveStaffGuard = ActiveStaffGuard;
exports.ActiveStaffGuard = ActiveStaffGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [staff_auth_service_1.StaffAuthService])
], ActiveStaffGuard);
//# sourceMappingURL=active-staff.guard.js.map