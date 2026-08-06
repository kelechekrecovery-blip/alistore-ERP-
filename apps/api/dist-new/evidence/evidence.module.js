"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvidenceModule = void 0;
const common_1 = require("@nestjs/common");
const media_module_1 = require("../media/media.module");
const evidence_controller_1 = require("./evidence.controller");
const evidence_service_1 = require("./evidence.service");
const evidence_retention_service_1 = require("./evidence-retention.service");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const authz_module_1 = require("../authz/authz.module");
let EvidenceModule = class EvidenceModule {
};
exports.EvidenceModule = EvidenceModule;
exports.EvidenceModule = EvidenceModule = __decorate([
    (0, common_1.Module)({
        imports: [media_module_1.MediaModule, staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule],
        controllers: [evidence_controller_1.EvidenceController],
        providers: [evidence_service_1.EvidenceService, evidence_retention_service_1.EvidenceRetentionService],
        exports: [evidence_service_1.EvidenceService, evidence_retention_service_1.EvidenceRetentionService],
    })
], EvidenceModule);
//# sourceMappingURL=evidence.module.js.map