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
exports.CampaignsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const campaigns_dto_1 = require("./campaigns.dto");
const campaigns_service_1 = require("./campaigns.service");
let CampaignsController = class CampaignsController {
    constructor(campaigns) {
        this.campaigns = campaigns;
    }
    preview(dto) {
        return this.campaigns.preview(dto);
    }
    create(user, dto) {
        return this.campaigns.create(dto, user.customerId);
    }
    update(user, id, dto) {
        return this.campaigns.update(id, dto, user.customerId);
    }
    submit(user, id) {
        return this.campaigns.submit(id, user.customerId);
    }
    activate(user, id) {
        return this.campaigns.activate(id, user.customerId);
    }
    pause(user, id) {
        return this.campaigns.pause(id, user.customerId);
    }
    complete(user, id) {
        return this.campaigns.complete(id, user.customerId);
    }
    recordSpend(user, id, dto) {
        return this.campaigns.recordSpend(id, dto, user.customerId);
    }
    list() {
        return this.campaigns.list();
    }
    roi(id) {
        return this.campaigns.roiFor(id);
    }
    convert(user, id, dto) {
        return this.campaigns.recordConversion(id, dto.orderId, user.customerId);
    }
};
exports.CampaignsController = CampaignsController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Preview a consent-filtered segment audience' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Audience counts and eligible customers.' }),
    (0, common_1.Post)('preview'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, require_permission_decorator_1.RequirePermission)('campaigns', 'read'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [campaigns_dto_1.SegmentRulesDto]),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "preview", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Create a campaign draft; no delivery is queued before approval and activation' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Campaign draft created.' }),
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('campaigns', 'create'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, campaigns_dto_1.CreateCampaignDto]),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/update'),
    (0, require_permission_decorator_1.RequirePermission)('campaigns', 'update'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, campaigns_dto_1.UpdateCampaignDto]),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/submit'),
    (0, require_permission_decorator_1.RequirePermission)('campaigns', 'submit'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "submit", null);
__decorate([
    (0, common_1.Post)(':id/activate'),
    (0, require_permission_decorator_1.RequirePermission)('campaigns', 'activate'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "activate", null);
__decorate([
    (0, common_1.Post)(':id/pause'),
    (0, require_permission_decorator_1.RequirePermission)('campaigns', 'pause'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "pause", null);
__decorate([
    (0, common_1.Post)(':id/complete'),
    (0, require_permission_decorator_1.RequirePermission)('campaigns', 'complete'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "complete", null);
__decorate([
    (0, common_1.Post)(':id/spend'),
    (0, require_permission_decorator_1.RequirePermission)('campaigns', 'reconcile'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, campaigns_dto_1.RecordCampaignSpendDto]),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "recordSpend", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List campaigns with ROI metrics' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Campaign list.' }),
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('campaigns', 'read'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "list", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Campaign ROI from ledger-backed conversions and received payments' }),
    (0, swagger_1.ApiOkResponse)({ description: 'ROI metrics.' }),
    (0, common_1.Get)(':id/roi'),
    (0, require_permission_decorator_1.RequirePermission)('campaigns', 'read'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "roi", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Attribute an order to a campaign once (campaign.converted)' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Updated ROI metrics.' }),
    (0, common_1.Post)(':id/conversions'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, require_permission_decorator_1.RequirePermission)('campaigns', 'convert'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, campaigns_dto_1.CampaignConversionDto]),
    __metadata("design:returntype", void 0)
], CampaignsController.prototype, "convert", null);
exports.CampaignsController = CampaignsController = __decorate([
    (0, swagger_1.ApiTags)('campaigns'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('campaigns'),
    __metadata("design:paramtypes", [campaigns_service_1.CampaignsService])
], CampaignsController);
//# sourceMappingURL=campaigns.controller.js.map