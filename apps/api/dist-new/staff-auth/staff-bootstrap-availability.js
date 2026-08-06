"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isStaffBootstrapAvailable = isStaffBootstrapAvailable;
function isStaffBootstrapAvailable(env) {
    if (env('NODE_ENV') !== 'production')
        return true;
    return env('STAFF_BOOTSTRAP_ENABLED')?.trim().toLowerCase() === 'true';
}
//# sourceMappingURL=staff-bootstrap-availability.js.map