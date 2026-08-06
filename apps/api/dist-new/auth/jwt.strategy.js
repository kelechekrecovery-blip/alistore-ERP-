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
exports.JwtStrategy = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const config_1 = require("@nestjs/config");
const passport_jwt_1 = require("passport-jwt");
const jwt_secret_1 = require("./jwt-secret");
const web_session_1 = require("./web-session");
let JwtStrategy = class JwtStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy) {
    constructor(config) {
        super({
            jwtFromRequest: (request) => {
                const bearer = passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken()(request);
                if (bearer)
                    return bearer;
                if ((0, web_session_1.isStaffWebSessionRequest)(request))
                    return (0, web_session_1.readWebCookie)(request, web_session_1.STAFF_ACCESS_COOKIE) ?? null;
                return (0, web_session_1.isWebSessionRequest)(request) ? ((0, web_session_1.readWebCookie)(request, web_session_1.WEB_ACCESS_COOKIE) ?? null) : null;
            },
            ignoreExpiration: false,
            secretOrKey: (0, jwt_secret_1.resolveJwtSecret)(config),
        });
    }
    validate(payload) {
        if (payload.typ !== 'customer' && payload.typ !== 'staff') {
            throw new common_1.UnauthorizedException('access_token_required');
        }
        return {
            customerId: payload.sub,
            phone: payload.phone,
            typ: payload.typ,
            role: payload.role,
            point: payload.point,
            storePointId: payload.storePointId,
        };
    }
};
exports.JwtStrategy = JwtStrategy;
exports.JwtStrategy = JwtStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], JwtStrategy);
//# sourceMappingURL=jwt.strategy.js.map