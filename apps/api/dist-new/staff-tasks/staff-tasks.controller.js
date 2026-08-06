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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffTasksController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const staff_tasks_dto_1 = require("./staff-tasks.dto");
const staff_tasks_service_1 = require("./staff-tasks.service");
let StaffTasksController = class StaffTasksController {
    constructor(tasks) {
        this.tasks = tasks;
    }
    list(dto) { return this.tasks.list(dto); }
    mine(user) { return this.tasks.mine(user.customerId); }
    updateMine(user, id, dto) {
        return this.tasks.updateMine(id, dto.status, user.customerId);
    }
    create(user, dto) {
        return this.tasks.create(dto, user.customerId);
    }
};
exports.StaffTasksController = StaffTasksController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('staff_tasks', 'manage'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [staff_tasks_dto_1.ListStaffTasksDto]),
    __metadata("design:returntype", void 0)
], StaffTasksController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('mine'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], StaffTasksController.prototype, "mine", null);
__decorate([
    (0, common_1.Patch)('mine/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, staff_tasks_dto_1.UpdateMyStaffTaskDto]),
    __metadata("design:returntype", void 0)
], StaffTasksController.prototype, "updateMine", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('staff_tasks', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, staff_tasks_dto_1.CreateStaffTaskDto]),
    __metadata("design:returntype", void 0)
], StaffTasksController.prototype, "create", null);
exports.StaffTasksController = StaffTasksController = __decorate([
    (0, swagger_1.ApiTags)('staff-tasks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('staff-tasks'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard),
    __metadata("design:paramtypes", [staff_tasks_service_1.StaffTasksService])
], StaffTasksController);
//# sourceMappingURL=staff-tasks.controller.js.map