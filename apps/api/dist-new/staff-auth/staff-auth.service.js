"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffAuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const node_crypto_1 = require("node:crypto");
const argon2 = __importStar(require("argon2"));
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
const totp_service_1 = require("../auth/totp.service");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const store_point_identity_1 = require("../common/store-point-identity");
const telegram_agent_revocation_1 = require("../telegram-agent/telegram-agent-revocation");
const STAFF_REFRESH_PREFIX = 'staff:';
const STAFF_REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
let StaffAuthService = class StaffAuthService {
    constructor(prisma, jwt, totp, audit) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.totp = totp;
        this.audit = audit;
    }
    async createStaff(username, password, role, point) {
        const requestedPoint = point?.trim()
            || (process.env.NODE_ENV === 'test' ? 'BISHKEK-1' : undefined);
        const storePoint = await (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, requestedPoint, `Точка продаж «${requestedPoint ?? ''}» не найдена или отключена`);
        const passwordHash = await argon2.hash(password);
        return this.prisma.staffUser.create({
            data: { username, passwordHash, role, point: storePoint.inventoryLocation },
        });
    }
    async needsBootstrap() {
        return (await this.prisma.staffUser.count()) === 0;
    }
    async bootstrapOwner(username, password, point) {
        const count = await this.prisma.staffUser.count();
        if (count > 0) {
            throw new errors_1.ValidationError('staff_already_bootstrapped', 'Персонал уже создан — войдите владельцем и добавляйте через /staff-auth/staff');
        }
        return this.createStaff(username, password, 'owner', point);
    }
    async login(username, password, totp) {
        const staff = await this.prisma.staffUser.findUnique({ where: { username } });
        const ok = staff && staff.active
            ? await argon2.verify(staff.passwordHash, password).catch(() => false)
            : false;
        if (!staff || !ok) {
            throw new errors_1.ValidationError('staff_invalid_credentials', 'Неверный логин или пароль');
        }
        if (staff.totpEnabled) {
            this.assertLoginTotp(staff, totp);
        }
        return this.issueTokens(staff);
    }
    assertLoginTotp(staff, totp) {
        if (!staff.totpSecret) {
            throw new errors_1.UnauthorizedError('totp_required', 'Нужен код двухфакторной аутентификации');
        }
        const token = totp?.trim();
        if (!token) {
            throw new errors_1.UnauthorizedError('totp_required', 'Нужен код двухфакторной аутентификации');
        }
        if (!this.totp.verify(token, staff.totpSecret)) {
            throw new errors_1.UnauthorizedError('totp_invalid', 'Неверный код двухфакторной аутентификации');
        }
    }
    async refresh(refreshToken) {
        const tokenHash = this.hashToken(refreshToken);
        const outcome = await this.prisma.$transaction(async (tx) => {
            const locked = await tx.$queryRaw `
        SELECT id FROM "RefreshToken" WHERE "tokenHash" = ${tokenHash} FOR UPDATE
      `;
            if (locked.length === 0)
                throw new errors_1.ValidationError('staff_refresh_invalid', 'Staff-сессия недействительна');
            const record = await tx.refreshToken.findUnique({ where: { tokenHash } });
            if (!record || record.expiresAt < new Date() || !record.customerId.startsWith(STAFF_REFRESH_PREFIX)) {
                throw new errors_1.ValidationError('staff_refresh_invalid', 'Staff-сессия недействительна');
            }
            if (record.revokedAt) {
                await tx.refreshToken.updateMany({ where: { customerId: record.customerId, revokedAt: null }, data: { revokedAt: new Date() } });
                return { kind: 'reused' };
            }
            await tx.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
            const staff = await tx.staffUser.findUnique({ where: { id: record.customerId.slice(STAFF_REFRESH_PREFIX.length) } });
            if (!staff?.active)
                throw new errors_1.ValidationError('staff_inactive', 'Сотрудник деактивирован');
            return { kind: 'rotated', tokens: await this.issueTokens(staff, tx) };
        });
        if (outcome.kind === 'reused')
            throw new errors_1.ValidationError('staff_refresh_reused', 'Повторное использование staff-сессии — вход выполнен заново');
        return outcome.tokens;
    }
    async logout(refreshToken) {
        await this.prisma.refreshToken.updateMany({ where: { tokenHash: this.hashToken(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
    }
    async issueTokens(staff, db = this.prisma) {
        const storePoint = await (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, staff.point, 'Назначенная сотруднику точка отключена');
        const accessToken = await this.jwt.signAsync({
            sub: staff.id,
            role: staff.role,
            typ: 'staff',
            point: storePoint.inventoryLocation,
            storePointId: storePoint.id,
        }, { expiresIn: '15m' });
        const refreshToken = (0, node_crypto_1.randomBytes)(32).toString('base64url');
        await db.refreshToken.create({
            data: {
                customerId: `${STAFF_REFRESH_PREFIX}${staff.id}`,
                tokenHash: this.hashToken(refreshToken),
                expiresAt: new Date(Date.now() + STAFF_REFRESH_TTL_MS),
            },
        });
        return {
            accessToken,
            refreshToken,
            staffId: staff.id,
            username: staff.username,
            role: staff.role,
            point: storePoint.inventoryLocation,
            storePoint: {
                id: storePoint.id,
                code: storePoint.code,
                name: storePoint.name,
                inventoryLocation: storePoint.inventoryLocation,
            },
            totpEnabled: staff.totpEnabled,
        };
    }
    hashToken(token) {
        return (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
    }
    async me(staffId) {
        const staff = await this.getActiveStaff(staffId);
        const storePoint = await (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, staff.point, 'Назначенная сотруднику точка отключена');
        return {
            ...this.publicView(staff),
            storePoint: {
                id: storePoint.id,
                code: storePoint.code,
                name: storePoint.name,
                inventoryLocation: storePoint.inventoryLocation,
            },
        };
    }
    async setupTotp(staffId) {
        const staff = await this.getActiveStaff(staffId);
        if (staff.totpEnabled) {
            throw new errors_1.ValidationError('staff_2fa_already_enabled', '2FA уже включена');
        }
        const secret = this.totp.generateSecret();
        await this.prisma.staffUser.update({
            where: { id: staff.id },
            data: { totpSecret: secret, totpEnabled: false, totpLastToken: null },
        });
        return {
            secret,
            otpauthUrl: this.totp.keyUri(staff.username, 'AliStore', secret),
            totpEnabled: false,
        };
    }
    async enableTotp(staffId, token) {
        const staff = await this.getActiveStaff(staffId);
        if (!staff.totpSecret) {
            throw new errors_1.ValidationError('staff_2fa_setup_required', 'Сначала создайте секрет 2FA');
        }
        if (!this.totp.verify(token, staff.totpSecret)) {
            throw new errors_1.ForbiddenError('staff_2fa_invalid_token', 'Неверный код 2FA');
        }
        const updated = await this.prisma.staffUser.update({
            where: { id: staff.id },
            data: { totpEnabled: true },
        });
        return this.publicView(updated);
    }
    async disableTotp(staffId, token) {
        const staff = await this.getActiveStaff(staffId);
        if (!staff.totpEnabled || !staff.totpSecret) {
            await this.prisma.$transaction(async (tx) => {
                await tx.$queryRaw `SELECT id FROM "StaffUser" WHERE id = ${staff.id} FOR UPDATE`;
                await (0, telegram_agent_revocation_1.revokeTelegramAgentAccessOnTx)(tx, { staffId: staff.id }, 'staff_totp_not_enabled');
            });
            return this.publicView(staff);
        }
        if (!this.totp.verify(token, staff.totpSecret)) {
            throw new errors_1.ForbiddenError('staff_2fa_invalid_token', 'Неверный код 2FA');
        }
        const updated = await this.prisma.$transaction(async (tx) => {
            const result = await tx.staffUser.update({
                where: { id: staff.id },
                data: { totpEnabled: false, totpSecret: null, totpLastToken: null },
            });
            await (0, telegram_agent_revocation_1.revokeTelegramAgentAccessOnTx)(tx, { staffId: staff.id }, 'staff_totp_disabled');
            return result;
        });
        return this.publicView(updated);
    }
    async resetTotpByAdmin(actorId, targetStaffId) {
        const target = await this.getActiveStaff(targetStaffId);
        const updated = await this.auditLedger().transaction(async (tx) => {
            const staff = await tx.staffUser.update({
                where: { id: target.id },
                data: { totpEnabled: false, totpSecret: null, totpLastToken: null },
            });
            await (0, telegram_agent_revocation_1.revokeTelegramAgentAccessOnTx)(tx, { staffId: target.id }, 'staff_totp_reset');
            return {
                result: staff,
                events: [
                    {
                        type: event_types_1.EventType.StaffTotpReset,
                        actor: actorId,
                        payload: { targetStaffId: target.id, username: target.username },
                        refs: [target.id],
                    },
                ],
            };
        });
        return this.publicView(updated);
    }
    async deactivateStaff(actorId, targetStaffId) {
        const updated = await this.auditLedger().transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "StaffUser" WHERE id = ${targetStaffId} FOR UPDATE`;
            const target = await tx.staffUser.findUnique({ where: { id: targetStaffId } });
            if (!target) {
                throw new errors_1.ValidationError('staff_not_found', 'Сотрудник не найден');
            }
            if (!target.active) {
                await (0, telegram_agent_revocation_1.revokeTelegramAgentAccessOnTx)(tx, { staffId: target.id }, 'staff_deactivated');
                return { result: target, events: [] };
            }
            const [openShift, activeDeliveries] = await Promise.all([
                tx.cashShift.findFirst({
                    where: { staffId: target.id, closedAt: null },
                    select: { id: true },
                }),
                tx.order.findMany({
                    where: {
                        courierId: target.id,
                        status: { in: ['courier_assigned', 'out_for_delivery'] },
                    },
                    select: { id: true, status: true },
                }),
            ]);
            const blockers = [];
            if (openShift) {
                blockers.push(`открытая кассовая смена ${openShift.id} — закройте или передайте смену (handover)`);
            }
            for (const order of activeDeliveries) {
                blockers.push(`активная доставка заказа ${order.id} (${order.status}) — переназначьте курьера`);
            }
            if (blockers.length > 0) {
                throw new errors_1.ConflictError('staff_deactivation_blocked', `Деактивация заблокирована: ${blockers.join('; ')}`);
            }
            const staff = await tx.staffUser.update({
                where: { id: target.id },
                data: { active: false },
            });
            await (0, telegram_agent_revocation_1.revokeTelegramAgentAccessOnTx)(tx, { staffId: target.id }, 'staff_deactivated');
            return {
                result: staff,
                events: [
                    {
                        type: event_types_1.EventType.StaffDeactivated,
                        actor: actorId,
                        payload: { targetStaffId: target.id, username: target.username },
                        refs: [target.id],
                    },
                ],
            };
        });
        return this.publicView(updated);
    }
    async changeRole(actorId, targetStaffId, role) {
        const updated = await this.auditLedger().transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "StaffUser" WHERE id = ${targetStaffId} FOR UPDATE`;
            const target = await tx.staffUser.findUnique({ where: { id: targetStaffId } });
            if (!target)
                throw new errors_1.ValidationError('staff_not_found', 'Сотрудник не найден');
            if (target.role === role) {
                if (!['admin', 'owner'].includes(role)) {
                    await (0, telegram_agent_revocation_1.revokeTelegramAgentAccessOnTx)(tx, { staffId: target.id }, 'staff_role_revoked');
                }
                return { result: target, events: [] };
            }
            if (target.role === 'owner') {
                const owners = await tx.staffUser.count({ where: { role: 'owner', active: true, id: { not: target.id } } });
                if (owners === 0) {
                    throw new errors_1.ConflictError('last_owner_protected', 'Нельзя снять роль у последнего активного владельца');
                }
            }
            const staff = await tx.staffUser.update({ where: { id: target.id }, data: { role } });
            if (!['admin', 'owner'].includes(role)) {
                await (0, telegram_agent_revocation_1.revokeTelegramAgentAccessOnTx)(tx, { staffId: target.id }, 'staff_role_revoked');
            }
            return {
                result: staff,
                events: [{
                        type: event_types_1.EventType.StaffRoleChanged,
                        actor: actorId,
                        payload: { targetStaffId: target.id, username: target.username, from: target.role, to: role },
                        refs: [target.id],
                    }],
            };
        });
        return this.publicView(updated);
    }
    async reactivateStaff(actorId, targetStaffId) {
        const updated = await this.auditLedger().transaction(async (tx) => {
            const target = await tx.staffUser.findUnique({ where: { id: targetStaffId } });
            if (!target)
                throw new errors_1.ValidationError('staff_not_found', 'Сотрудник не найден');
            if (target.active)
                return { result: target, events: [] };
            const staff = await tx.staffUser.update({ where: { id: target.id }, data: { active: true } });
            return {
                result: staff,
                events: [{
                        type: event_types_1.EventType.StaffReactivated,
                        actor: actorId,
                        payload: { targetStaffId: target.id, username: target.username },
                        refs: [target.id],
                    }],
            };
        });
        return this.publicView(updated);
    }
    async resetPasswordByAdmin(actorId, targetStaffId, password) {
        const passwordHash = await argon2.hash(password);
        const updated = await this.auditLedger().transaction(async (tx) => {
            const target = await tx.staffUser.findUnique({ where: { id: targetStaffId } });
            if (!target)
                throw new errors_1.ValidationError('staff_not_found', 'Сотрудник не найден');
            const staff = await tx.staffUser.update({ where: { id: target.id }, data: { passwordHash } });
            await (0, telegram_agent_revocation_1.revokeTelegramAgentAccessOnTx)(tx, { staffId: target.id }, 'staff_password_reset');
            const revoked = await tx.refreshToken.updateMany({
                where: { customerId: `${STAFF_REFRESH_PREFIX}${target.id}`, revokedAt: null },
                data: { revokedAt: new Date() },
            });
            return {
                result: staff,
                events: [{
                        type: event_types_1.EventType.StaffPasswordReset,
                        actor: actorId,
                        payload: { targetStaffId: target.id, username: target.username, revokedSessions: revoked.count },
                        refs: [target.id],
                    }],
            };
        });
        return this.publicView(updated);
    }
    async listStaff() {
        const staff = await this.prisma.staffUser.findMany({
            select: { id: true, username: true, role: true, point: true, active: true, totpEnabled: true },
            orderBy: [{ active: 'desc' }, { username: 'asc' }],
        });
        return staff;
    }
    async handoverTargets(point, excludeStaffId) {
        return this.prisma.staffUser.findMany({
            where: { point, active: true, id: { not: excludeStaffId } },
            select: { id: true, username: true, role: true },
            orderBy: { username: 'asc' },
        });
    }
    async verifyStepUp(staffId, token) {
        const staff = await this.getActiveStaff(staffId);
        if (!staff.totpEnabled || !staff.totpSecret) {
            throw new errors_1.ForbiddenError('staff_2fa_required', 'Включите 2FA перед одобрением опасных действий');
        }
        if (!token) {
            throw new errors_1.ForbiddenError('staff_2fa_token_required', 'Введите код 2FA');
        }
        if (!this.totp.verify(token, staff.totpSecret)) {
            throw new errors_1.ForbiddenError('staff_2fa_invalid_token', 'Неверный код 2FA');
        }
        const consumed = await this.prisma.staffUser.updateMany({
            where: {
                id: staffId,
                OR: [{ totpLastToken: null }, { totpLastToken: { not: token } }],
            },
            data: { totpLastToken: token },
        });
        if (consumed.count === 0) {
            throw new errors_1.ForbiddenError('staff_2fa_token_reused', 'Код уже использован — дождитесь нового');
        }
    }
    async verifyStepUpOnTx(tx, staffId, token) {
        const staff = await tx.staffUser.findUnique({ where: { id: staffId } });
        if (!staff || !staff.active) {
            throw new errors_1.ForbiddenError('staff_not_found', 'Сотрудник не найден или отключён');
        }
        if (!staff.totpEnabled || !staff.totpSecret) {
            throw new errors_1.ForbiddenError('staff_2fa_required', 'Включите 2FA перед одобрением опасных действий');
        }
        if (!token) {
            throw new errors_1.ForbiddenError('staff_2fa_token_required', 'Введите код 2FA');
        }
        if (!this.totp.verify(token, staff.totpSecret)) {
            throw new errors_1.ForbiddenError('staff_2fa_invalid_token', 'Неверный код 2FA');
        }
        const consumed = await tx.staffUser.updateMany({
            where: {
                id: staffId,
                OR: [{ totpLastToken: null }, { totpLastToken: { not: token } }],
            },
            data: { totpLastToken: token },
        });
        if (consumed.count === 0) {
            throw new errors_1.ForbiddenError('staff_2fa_token_reused', 'Код уже использован — дождитесь нового');
        }
    }
    async getActiveStaff(staffId) {
        const staff = await this.prisma.staffUser.findUnique({ where: { id: staffId } });
        if (!staff || !staff.active) {
            throw new errors_1.ForbiddenError('staff_not_found', 'Сотрудник не найден или отключён');
        }
        await (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, staff.point, 'Назначенная сотруднику точка отключена');
        return staff;
    }
    auditLedger() {
        if (!this.audit) {
            throw new Error('AuditService is not wired into StaffAuthService');
        }
        return this.audit;
    }
    publicView(staff) {
        return {
            id: staff.id,
            username: staff.username,
            role: staff.role,
            point: staff.point,
            active: staff.active,
            totpEnabled: staff.totpEnabled,
        };
    }
};
exports.StaffAuthService = StaffAuthService;
exports.StaffAuthService = StaffAuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        totp_service_1.TotpService,
        audit_service_1.AuditService])
], StaffAuthService);
//# sourceMappingURL=staff-auth.service.js.map