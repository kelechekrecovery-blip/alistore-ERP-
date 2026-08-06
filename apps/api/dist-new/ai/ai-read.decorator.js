"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiReadGuard = AiReadGuard;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const blind_cash_read_guard_1 = require("../auth/blind-cash-read.guard");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
function AiReadGuard() {
    return (0, common_1.applyDecorators)((0, swagger_1.ApiBearerAuth)(), (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, blind_cash_read_guard_1.BlindCashReadGuard, permission_guard_1.PermissionGuard), (0, require_permission_decorator_1.RequirePermission)('ai', 'read'));
}
//# sourceMappingURL=ai-read.decorator.js.map