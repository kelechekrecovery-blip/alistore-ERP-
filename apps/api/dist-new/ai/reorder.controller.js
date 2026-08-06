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
exports.ReorderController = exports.ReorderDraftApprovalDto = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const approvals_service_1 = require("../approvals/approvals.service");
const blind_cash_read_guard_1 = require("../auth/blind-cash-read.guard");
const ai_read_decorator_1 = require("./ai-read.decorator");
const reorder_draft_1 = require("./reorder-draft");
const reorder_service_1 = require("./reorder.service");
class ReorderDraftApprovalDto {
}
exports.ReorderDraftApprovalDto = ReorderDraftApprovalDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], ReorderDraftApprovalDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], ReorderDraftApprovalDto.prototype, "supplierId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], ReorderDraftApprovalDto.prototype, "location", void 0);
__decorate([
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], ReorderDraftApprovalDto.prototype, "unitCosts", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], ReorderDraftApprovalDto.prototype, "reason", void 0);
let ReorderController = class ReorderController {
    constructor(reorder, approvals) {
        this.reorder = reorder;
        this.approvals = approvals;
    }
    review() {
        return this.reorder.review();
    }
    requestDraftApproval(user, dto) {
        return this.reorder.review().then((report) => {
            const draft = (0, reorder_draft_1.buildReorderDraft)({
                idempotencyKey: dto.idempotencyKey,
                supplierId: dto.supplierId,
                location: dto.location,
                unitCosts: dto.unitCosts,
                reviews: report.reviews,
            });
            return this.approvals.request({
                action: 'procurement_draft',
                requester: user.customerId,
                reason: dto.reason?.trim() || 'AI reorder recommendation requires procurement approval',
                payload: draft,
                evidence: { source: 'ai.reorder', generatedForCount: report.generatedForCount, needsReorder: report.needsReorder },
                idempotencyKey: draft.idempotencyKey,
                sourceRef: 'ai.reorder',
            });
        });
    }
};
exports.ReorderController = ReorderController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Рекомендации по закупкам — правила спрос/остаток (keyless, read-only)' }),
    (0, swagger_1.ApiOkResponse)({ description: '{ source, generatedForCount, needsReorder, reviews[] }.' }),
    (0, common_1.Get)('reorder'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ReorderController.prototype, "review", null);
__decorate([
    (0, common_1.Post)('reorder/draft-approval'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, blind_cash_read_guard_1.BlindCashReadGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'create'),
    (0, swagger_1.ApiOperation)({ summary: 'Создать approval-заявку на закупочный draft из свежей reorder-рекомендации' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ReorderDraftApprovalDto]),
    __metadata("design:returntype", void 0)
], ReorderController.prototype, "requestDraftApproval", null);
exports.ReorderController = ReorderController = __decorate([
    (0, swagger_1.ApiTags)('ai'),
    (0, ai_read_decorator_1.AiReadGuard)(),
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [reorder_service_1.ReorderService,
        approvals_service_1.ApprovalsService])
], ReorderController);
//# sourceMappingURL=reorder.controller.js.map