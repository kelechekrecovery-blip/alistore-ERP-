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
exports.EvidenceController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const throttler_1 = require("@nestjs/throttler");
const optional_jwt_auth_guard_1 = require("../auth/optional-jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const swagger_1 = require("@nestjs/swagger");
const errors_1 = require("../common/errors");
const evidence_dto_1 = require("./evidence.dto");
const evidence_service_1 = require("./evidence.service");
const guest_capability_1 = require("../auth/guest-capability");
const staff_auth_service_1 = require("../staff-auth/staff-auth.service");
let EvidenceController = class EvidenceController {
    constructor(evidence, staffAuth) {
        this.evidence = evidence;
        this.staffAuth = staffAuth;
    }
    async readImage(idempotencyKey, user, capability) {
        const key = idempotencyKey.trim();
        if (!key || key.length > 128)
            throw new common_1.BadRequestException('Некорректный Evidence idempotency key');
        const upload = await this.evidence.findUpload(key);
        let actor;
        if (user?.typ === 'staff') {
            const staff = await this.staffAuth.me(user.customerId);
            await this.evidence.assertStaffCanRead(user.role ?? '');
            if (upload.entityType === 'shift') {
                await this.evidence.assertStaffCanAttachShift(user.customerId, staff.role, upload.entityId);
            }
            if (upload.entityType === 'order') {
                await this.evidence.assertStaffCanAttachOrder(user.customerId, staff.role, upload.entityId);
            }
            actor = `staff:${user.customerId}`;
        }
        else {
            const customerId = user?.typ === 'customer'
                ? user.customerId
                : (0, guest_capability_1.requireGuestCapability)(capability, 'evidence:read').sub;
            await this.evidence.assertCustomerOwnsEntity(customerId, upload.entityType, upload.entityId);
            actor = user?.customerId ? `customer:${user.customerId}` : `guest:${customerId}`;
        }
        return this.evidence.issueRead(key, actor);
    }
    async uploadImage(file, dto, user, capability, idempotencyKey) {
        const key = idempotencyKey?.trim();
        if (!key)
            throw new common_1.BadRequestException('Idempotency-Key обязателен');
        if (key.length > 128)
            throw new common_1.BadRequestException('Idempotency-Key слишком длинный');
        if (!file) {
            throw new errors_1.ValidationError('no_file', 'Файл не приложен (поле "file")');
        }
        const custodyEvidence = dto.entityType === 'loaner' && ['loaner_issue', 'loaner_return'].includes(dto.label?.trim() ?? '');
        const quarantineEvidence = dto.entityType === 'quarantine' && dto.label?.trim() === 'quarantine_diagnosis';
        const exchangeEvidence = dto.entityType === 'exchange' && dto.label?.trim() === 'exchange_condition';
        const trustedStaffEvidence = custodyEvidence || quarantineEvidence || exchangeEvidence;
        let guestCustomerId;
        if (user?.typ === 'staff') {
            const staff = await this.staffAuth.me(user.customerId);
            if (dto.entityType === 'shift') {
                await this.evidence.assertStaffCanAttachShift(user.customerId, staff.role, dto.entityId);
            }
            if (dto.entityType === 'order') {
                await this.evidence.assertStaffCanAttachOrder(user.customerId, staff.role, dto.entityId);
            }
            if (custodyEvidence)
                await this.evidence.assertStaffCanAttachLoanerCustody(user.customerId, dto.entityId);
            if (exchangeEvidence)
                await this.evidence.assertStaffCanAttachExchange(user.customerId, dto.entityId);
        }
        else {
            if (custodyEvidence || exchangeEvidence)
                throw new common_1.ForbiddenException('staff_evidence_only');
            guestCustomerId = user?.typ === 'customer'
                ? undefined
                : (0, guest_capability_1.requireGuestCapability)(capability, 'evidence:write').sub;
            const customerId = user?.customerId ?? guestCustomerId;
            await this.evidence.assertCustomerOwnsEntity(customerId, dto.entityType, dto.entityId);
        }
        const actor = user?.typ === 'staff' ? `staff:${user.customerId}` : user?.customerId ?? guestCustomerId;
        return this.evidence.attachImage(file.buffer, { ...dto, actor }, trustedStaffEvidence && user?.typ === 'staff', key);
    }
};
exports.EvidenceController = EvidenceController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Issue a short-lived authorized read URL for an Evidence Vault image' }),
    (0, common_1.Get)('images/:idempotencyKey'),
    (0, common_1.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 60, ttl: 60_000 } }),
    __param(0, (0, common_1.Param)('idempotencyKey')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Headers)('x-guest-capability')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], EvidenceController.prototype, "readImage", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Attach an image evidence file to a domain entity' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['file', 'entityType', 'entityId'],
            properties: {
                file: { type: 'string', format: 'binary' },
                entityType: { type: 'string', enum: ['tradein', 'return', 'warranty', 'inventory', 'order', 'support', 'shift', 'loaner', 'quarantine', 'exchange'] },
                entityId: { type: 'string' },
                label: { type: 'string' },
                actor: { type: 'string' },
            },
        },
    }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Image compressed, stored, and linked in Event Ledger.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'No file, bad image, or unknown entity.' }),
    (0, common_1.Post)('images'),
    (0, common_1.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60_000 } }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: 8 * 1024 * 1024 } })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Headers)('x-guest-capability')),
    __param(4, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, evidence_dto_1.EvidenceImageDto, Object, String, String]),
    __metadata("design:returntype", Promise)
], EvidenceController.prototype, "uploadImage", null);
exports.EvidenceController = EvidenceController = __decorate([
    (0, swagger_1.ApiTags)('evidence'),
    (0, common_1.Controller)('evidence'),
    __metadata("design:paramtypes", [evidence_service_1.EvidenceService, staff_auth_service_1.StaffAuthService])
], EvidenceController);
//# sourceMappingURL=evidence.controller.js.map