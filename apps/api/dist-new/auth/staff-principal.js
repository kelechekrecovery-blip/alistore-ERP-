"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireActiveStaff = requireActiveStaff;
const common_1 = require("@nestjs/common");
async function requireActiveStaff(user, staffAuth) {
    if (user.typ !== 'staff' || !user.role) {
        throw new common_1.ForbiddenException('Требуется staff JWT');
    }
    const current = await staffAuth.me(user.customerId);
    if (current.role !== user.role) {
        throw new common_1.ForbiddenException('Роль сотрудника изменилась — войдите снова');
    }
    return user.customerId;
}
//# sourceMappingURL=staff-principal.js.map