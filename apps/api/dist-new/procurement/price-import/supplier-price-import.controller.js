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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupplierPriceImportController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const supplier_price_import_service_1 = require("./supplier-price-import.service");
const supplier_price_import_dto_1 = require("./supplier-price-import.dto");
const jwt_auth_guard_1 = require("../../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../../auth/active-staff.guard");
const permission_guard_1 = require("../../authz/permission.guard");
const require_permission_decorator_1 = require("../../authz/require-permission.decorator");
const current_user_decorator_1 = require("../../auth/current-user.decorator");
const errors_1 = require("../../common/errors");
let SupplierPriceImportController = class SupplierPriceImportController {
    constructor(imports) {
        this.imports = imports;
    }
    async stage(user, dto, file) {
        if (!file)
            throw new errors_1.ValidationError('no_file', 'Файл не приложен (поле "file")');
        const mapping = this.parseMapping(dto.mapping);
        return this.imports.stage(file.buffer, dto.supplierId, mapping, user.customerId);
    }
    async get(id) {
        return this.imports.get(id);
    }
    async apply(user, id) {
        return this.imports.apply(id, user.customerId);
    }
    parseMapping(raw) {
        if (raw === undefined)
            return undefined;
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            throw new errors_1.ValidationError('mapping_invalid_json', 'mapping должен быть валидным JSON');
        }
        if (typeof parsed !== 'object' ||
            parsed === null ||
            typeof parsed.sku !== 'string' ||
            typeof parsed.price !== 'string') {
            throw new errors_1.ValidationError('mapping_invalid_shape', 'mapping обязан задавать строковые sku и price');
        }
        return parsed;
    }
};
exports.SupplierPriceImportController = SupplierPriceImportController;
__decorate([
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('products', 'update'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiOperation)({ summary: 'Stage a supplier price list: parse + classify, no writes to Product yet' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, supplier_price_import_dto_1.CreateSupplierPriceImportDto, Object]),
    __metadata("design:returntype", Promise)
], SupplierPriceImportController.prototype, "stage", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('products', 'update'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SupplierPriceImportController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(':id/apply'),
    (0, require_permission_decorator_1.RequirePermission)('products', 'update'),
    (0, swagger_1.ApiOperation)({ summary: 'Apply a staged batch — idempotent, writes cost/supplyLeadDays/supplierId + ledger events' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SupplierPriceImportController.prototype, "apply", null);
exports.SupplierPriceImportController = SupplierPriceImportController = __decorate([
    (0, swagger_1.ApiTags)('procurement'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('procurement/price-imports'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [supplier_price_import_service_1.SupplierPriceImportService])
], SupplierPriceImportController);
//# sourceMappingURL=supplier-price-import.controller.js.map