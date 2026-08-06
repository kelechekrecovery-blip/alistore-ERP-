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
exports.ProtectionService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const prisma_service_1 = require("../prisma/prisma.service");
const STAFF_TRANSITIONS = {
    requested: ['reviewing', 'offered', 'rejected'],
    reviewing: ['offered', 'rejected'],
    offered: ['rejected'],
    active: [],
    rejected: [],
    cancelled: [],
};
const RATE = {
    accidental_damage: 0.06,
    extended_warranty: 0.04,
    full_protection: 0.09,
};
let ProtectionService = class ProtectionService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    mine(customerId) {
        return this.prisma.deviceProtectionPolicy.findMany({
            where: { customerId },
            orderBy: { createdAt: 'desc' },
        });
    }
    list() {
        return this.prisma.deviceProtectionPolicy.findMany({
            orderBy: { createdAt: 'asc' },
            take: 100,
        });
    }
    async request(customerId, dto) {
        const unit = await this.prisma.deviceUnit.findUnique({
            where: { imei: dto.imei.trim() },
            include: { product: true },
        });
        if (!unit?.orderId || unit.status !== 'sold') {
            throw new errors_1.ValidationError('protection_device_not_eligible', 'Устройство не найдено среди проданных');
        }
        const order = await this.prisma.order.findUnique({ where: { id: unit.orderId } });
        if (!order || order.customerId !== customerId) {
            throw new errors_1.ForbiddenError('protection_device_owner_mismatch', 'Нельзя страховать чужое устройство');
        }
        const duplicate = await this.prisma.deviceProtectionPolicy.findFirst({
            where: { imei: unit.imei, status: { in: ['requested', 'reviewing', 'offered', 'active'] } },
        });
        if (duplicate) {
            throw new errors_1.ConflictError('protection_already_exists', 'Для устройства уже есть активная заявка');
        }
        const durationFactor = dto.coverageMonths === 24 ? 1.7 : 1;
        const suggestedPremium = Math.max(1_000, Math.round((unit.product.price * RATE[dto.planType] * durationFactor) / 100) * 100);
        return this.audit.transaction(async (tx) => {
            const policy = await tx.deviceProtectionPolicy.create({
                data: {
                    customerId,
                    orderId: order.id,
                    imei: unit.imei,
                    productName: unit.product.name,
                    planType: dto.planType,
                    deviceValue: unit.product.price,
                    premium: suggestedPremium,
                    coverageMonths: dto.coverageMonths,
                },
            });
            return {
                result: policy,
                events: [{
                        type: event_types_1.EventType.ProtectionRequested,
                        actor: customerId,
                        payload: {
                            policyId: policy.id,
                            imei: policy.imei,
                            planType: policy.planType,
                            coverageMonths: policy.coverageMonths,
                            suggestedPremium,
                        },
                        refs: [policy.id, customerId, order.id, unit.imei],
                    }],
            };
        });
    }
    async update(id, dto, actor) {
        return this.audit.transaction(async (tx) => {
            const policy = await tx.deviceProtectionPolicy.findUnique({ where: { id } });
            if (!policy)
                throw new errors_1.ValidationError('protection_not_found', `Заявка ${id} не найдена`);
            const to = dto.status;
            if (!STAFF_TRANSITIONS[policy.status].includes(to)) {
                throw new errors_1.ConflictError('protection_illegal_transition', `${policy.status} → ${to} запрещён`);
            }
            const premium = dto.premium ?? policy.premium;
            if (to === 'offered' && premium === null) {
                throw new errors_1.ValidationError('protection_premium_required', 'Укажите страховую премию');
            }
            const updated = await tx.deviceProtectionPolicy.update({
                where: { id },
                data: {
                    status: to,
                    premium,
                    staffNote: dto.staffNote?.trim() || undefined,
                },
            });
            return {
                result: updated,
                events: [this.event(policy.id, policy.customerId, policy.status, to, actor)],
            };
        });
    }
    async accept(id, customerId) {
        return this.audit.transaction(async (tx) => {
            const policy = await tx.deviceProtectionPolicy.findUnique({ where: { id } });
            if (!policy)
                throw new errors_1.ValidationError('protection_not_found', `Заявка ${id} не найдена`);
            if (policy.customerId !== customerId) {
                throw new errors_1.ForbiddenError('protection_owner_mismatch', 'Нельзя активировать чужую защиту');
            }
            if (policy.status !== 'offered') {
                throw new errors_1.ConflictError('protection_illegal_transition', `${policy.status} → active запрещён`);
            }
            const startsAt = new Date();
            const endsAt = new Date(startsAt);
            endsAt.setMonth(endsAt.getMonth() + policy.coverageMonths);
            const updated = await tx.deviceProtectionPolicy.update({
                where: { id },
                data: { status: 'active', startsAt, endsAt },
            });
            return {
                result: updated,
                events: [this.event(id, customerId, policy.status, 'active', customerId)],
            };
        });
    }
    event(policyId, customerId, from, to, actor) {
        return {
            type: event_types_1.EventType.ProtectionUpdated,
            actor,
            payload: { policyId, from, to },
            refs: [policyId, customerId],
        };
    }
};
exports.ProtectionService = ProtectionService;
exports.ProtectionService = ProtectionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], ProtectionService);
//# sourceMappingURL=protection.service.js.map