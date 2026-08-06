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
exports.ResolveSupplyQuarantineDto = exports.ProposeSupplyQuarantineDto = void 0;
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class ProposeSupplyQuarantineDto {
}
exports.ProposeSupplyQuarantineDto = ProposeSupplyQuarantineDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], ProposeSupplyQuarantineDto.prototype, "reason", void 0);
__decorate([
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], ProposeSupplyQuarantineDto.prototype, "evidence", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(200),
    (0, class_validator_1.ArrayUnique)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ProposeSupplyQuarantineDto.prototype, "imeis", void 0);
class ResolveSupplyQuarantineDto {
}
exports.ResolveSupplyQuarantineDto = ResolveSupplyQuarantineDto;
__decorate([
    (0, class_validator_1.IsEnum)(client_1.SupplyQuarantineDisposition),
    __metadata("design:type", String)
], ResolveSupplyQuarantineDto.prototype, "disposition", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], ResolveSupplyQuarantineDto.prototype, "reason", void 0);
__decorate([
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], ResolveSupplyQuarantineDto.prototype, "evidence", void 0);
//# sourceMappingURL=supply-quarantine.dto.js.map