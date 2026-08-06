"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("../prisma/prisma.module");
const audit_module_1 = require("../audit/audit.module");
const jwt_secret_1 = require("../auth/jwt-secret");
const business_auth_service_1 = require("./business-auth.service");
const business_products_service_1 = require("./business-products.service");
const business_auth_guard_1 = require("./business-auth.guard");
const business_controller_1 = require("./business.controller");
let BusinessModule = class BusinessModule {
};
exports.BusinessModule = BusinessModule;
exports.BusinessModule = BusinessModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            audit_module_1.AuditModule,
            jwt_1.JwtModule.registerAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (config) => ({ secret: (0, jwt_secret_1.resolveJwtSecret)(config) }),
            }),
        ],
        controllers: [business_controller_1.BusinessController],
        providers: [business_auth_service_1.BusinessAuthService, business_products_service_1.BusinessProductsService, business_auth_guard_1.BusinessAuthGuard],
        exports: [business_auth_service_1.BusinessAuthService],
    })
], BusinessModule);
//# sourceMappingURL=business.module.js.map