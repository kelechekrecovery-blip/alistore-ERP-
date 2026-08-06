"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthzService = void 0;
const common_1 = require("@nestjs/common");
const casbin_1 = require("casbin");
const authz_model_1 = require("./authz.model");
let AuthzService = class AuthzService {
    async onModuleInit() {
        await this.init();
    }
    async init() {
        this.enforcer = await (0, casbin_1.newEnforcer)((0, casbin_1.newModelFromString)(authz_model_1.RBAC_MODEL), new casbin_1.StringAdapter(authz_model_1.RBAC_POLICY));
    }
    can(role, resource, action) {
        return this.enforcer.enforce(role, resource, action);
    }
};
exports.AuthzService = AuthzService;
exports.AuthzService = AuthzService = __decorate([
    (0, common_1.Injectable)()
], AuthzService);
//# sourceMappingURL=authz.service.js.map