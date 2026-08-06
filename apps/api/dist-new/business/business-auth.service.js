"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var BusinessAuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessAuthService = void 0;
const common_1 = require("@nestjs/common");
const argon2 = __importStar(require("argon2"));
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
let BusinessAuthService = BusinessAuthService_1 = class BusinessAuthService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createUser(sellerId, username, password) {
        const login = username.trim().toLowerCase();
        if (login.length < 3) {
            throw new errors_1.ValidationError('username_invalid', 'Логин короче трёх символов');
        }
        if (password.length < BusinessAuthService_1.MIN_PASSWORD) {
            throw new errors_1.ValidationError('password_too_short', `Пароль короче ${BusinessAuthService_1.MIN_PASSWORD} символов`);
        }
        return this.prisma.sellerUser.create({
            data: { sellerId, username: login, passwordHash: await argon2.hash(password) },
        });
    }
    async login(username, password) {
        const denied = new common_1.UnauthorizedException('Неверный логин или пароль');
        const user = await this.prisma.sellerUser.findUnique({
            where: { username: username.trim().toLowerCase() },
            include: { seller: { select: { id: true, name: true, active: true } } },
        });
        if (!user || !user.active || !user.seller.active)
            throw denied;
        if (!(await argon2.verify(user.passwordHash, password)))
            throw denied;
        return {
            typ: 'seller',
            userId: user.id,
            sellerId: user.seller.id,
            sellerName: user.seller.name,
            username: user.username,
        };
    }
};
exports.BusinessAuthService = BusinessAuthService;
BusinessAuthService.MIN_PASSWORD = 10;
exports.BusinessAuthService = BusinessAuthService = BusinessAuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BusinessAuthService);
//# sourceMappingURL=business-auth.service.js.map