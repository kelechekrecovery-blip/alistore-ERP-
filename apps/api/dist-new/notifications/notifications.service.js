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
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
let NotificationsService = class NotificationsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async registerPushToken(dto, user) {
        const binding = await this.resolveBinding(user);
        const existing = await this.prisma.pushToken.findUnique({ where: { token: dto.token } });
        if (existing)
            this.assertTokenOwnership(existing, binding);
        const token = await this.prisma.pushToken.upsert({
            where: { token: dto.token },
            update: {
                platform: dto.platform,
                deviceId: dto.deviceId,
                appScope: binding.scope,
                customerId: binding.customerId,
                staffId: binding.staffId,
                enabled: true,
                lastSeenAt: new Date(),
            },
            create: {
                token: dto.token,
                platform: dto.platform,
                deviceId: dto.deviceId,
                appScope: binding.scope,
                customerId: binding.customerId,
                staffId: binding.staffId,
                enabled: true,
            },
        });
        return {
            id: token.id,
            token: token.token,
            platform: token.platform,
            deviceId: token.deviceId,
            scope: token.appScope,
            customerId: token.customerId,
            staffId: token.staffId,
            enabled: token.enabled,
            lastSeenAt: token.lastSeenAt.toISOString(),
        };
    }
    async listMine(customerId, limit = 50) {
        return this.prisma.customerNotification.findMany({
            where: { customerId },
            orderBy: { createdAt: 'desc' },
            take: Math.min(Math.max(limit, 1), 100),
        });
    }
    async markRead(id, customerId) {
        const notification = await this.prisma.customerNotification.findFirst({
            where: { id, customerId },
        });
        if (!notification)
            throw new common_1.NotFoundException('Уведомление не найдено');
        if (!notification.readAt) {
            await this.prisma.customerNotification.update({
                where: { id: notification.id },
                data: { readAt: new Date() },
            });
        }
        return this.prisma.customerNotification.findUniqueOrThrow({ where: { id: notification.id } });
    }
    async resolveBinding(user) {
        if (!user) {
            throw new common_1.UnauthorizedException('Для регистрации push-токена требуется авторизация');
        }
        if (user.typ === 'customer') {
            const customer = await this.prisma.customer.findUnique({
                where: { id: user.customerId },
                select: { id: true },
            });
            if (!customer) {
                throw new errors_1.ValidationError('customer_not_found', 'Клиент не найден');
            }
            return { scope: 'customer', customerId: customer.id, staffId: null };
        }
        if (user.typ === 'staff') {
            const staff = await this.prisma.staffUser.findUnique({
                where: { id: user.customerId },
                select: { id: true, active: true },
            });
            if (!staff?.active) {
                throw new errors_1.ForbiddenError('staff_not_found', 'Сотрудник не найден или отключён');
            }
            return { scope: 'staff', customerId: null, staffId: staff.id };
        }
        throw new common_1.UnauthorizedException('Для регистрации push-токена требуется авторизация');
    }
    assertTokenOwnership(existing, binding) {
        const ownedByOtherCustomer = existing.customerId !== null && existing.customerId !== binding.customerId;
        const ownedByOtherStaff = existing.staffId !== null && existing.staffId !== binding.staffId;
        if (ownedByOtherCustomer || ownedByOtherStaff) {
            throw new errors_1.ConflictError('push_token_already_bound', 'Push-токен уже привязан к другому аккаунту');
        }
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map