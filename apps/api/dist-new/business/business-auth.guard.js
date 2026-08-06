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
exports.BusinessAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const jwt_secret_1 = require("../auth/jwt-secret");
let BusinessAuthGuard = class BusinessAuthGuard {
    constructor(jwt, config) {
        this.jwt = jwt;
        this.secret = (0, jwt_secret_1.resolveJwtSecret)(config);
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const header = request.headers.authorization ?? '';
        const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
        if (!token)
            throw new common_1.UnauthorizedException('Требуется вход в AliStore Business');
        let payload;
        try {
            payload = await this.jwt.verifyAsync(token, { secret: this.secret });
        }
        catch {
            throw new common_1.UnauthorizedException('Сессия истекла. Войдите снова');
        }
        if (payload.typ !== 'seller' || !payload.sellerId) {
            throw new common_1.UnauthorizedException('Требуется вход в AliStore Business');
        }
        request.user = {
            customerId: payload.sub ?? '',
            typ: 'seller',
            sellerId: payload.sellerId,
        };
        return true;
    }
};
exports.BusinessAuthGuard = BusinessAuthGuard;
exports.BusinessAuthGuard = BusinessAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService, config_1.ConfigService])
], BusinessAuthGuard);
//# sourceMappingURL=business-auth.guard.js.map