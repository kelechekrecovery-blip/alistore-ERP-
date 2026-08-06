"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitModule = void 0;
exports.trackRequestSubject = trackRequestSubject;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
let RateLimitModule = class RateLimitModule {
};
exports.RateLimitModule = RateLimitModule;
exports.RateLimitModule = RateLimitModule = __decorate([
    (0, common_1.Module)({
        imports: [throttler_1.ThrottlerModule.forRoot([{
                    ttl: 60_000,
                    limit: 100,
                    skipIf: () => process.env.E2E_TEST === 'true',
                    getTracker: trackRequestSubject,
                }])],
        exports: [throttler_1.ThrottlerModule],
    })
], RateLimitModule);
async function trackRequestSubject(req) {
    const user = req.user;
    const subject = user?.customerId;
    if (typeof subject === 'string' && subject.length > 0) {
        return `sub:${subject}`;
    }
    return `ip:${String(req.ip ?? 'unknown')}`;
}
//# sourceMappingURL=rate-limit.module.js.map