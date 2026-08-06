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
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const terminus_1 = require("@nestjs/terminus");
const backup_status_1 = require("../ops/backup-status");
const prisma_service_1 = require("../prisma/prisma.service");
const external_readiness_1 = require("./external-readiness");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const READINESS_HEAP_LIMIT_BYTES = 1536 * 1024 * 1024;
let HealthController = class HealthController {
    constructor(health, db, memory, prisma, config) {
        this.health = health;
        this.db = db;
        this.memory = memory;
        this.prisma = prisma;
        this.config = config;
    }
    check() {
        return this.ready();
    }
    async ready() {
        try {
            await this.probe();
        }
        catch {
            throw new common_1.ServiceUnavailableException();
        }
        return { status: 'ok' };
    }
    live() {
        return { status: 'ok' };
    }
    details() {
        return this.probe();
    }
    probe() {
        return this.health.check([
            () => this.db.pingCheck('database', this.prisma),
            () => this.memory.checkHeap('memory_heap', READINESS_HEAP_LIMIT_BYTES),
        ]);
    }
    async integrations() {
        return {
            ...(0, external_readiness_1.buildExternalReadinessReport)((name) => this.config.get(name)),
            backup: await this.backupFreshness(),
        };
    }
    async backupFreshness() {
        const [success, failure] = await Promise.all([
            this.prisma.setting.findUnique({ where: { key: backup_status_1.BACKUP_LAST_SUCCESS_KEY } }),
            this.prisma.setting.findUnique({ where: { key: backup_status_1.BACKUP_LAST_FAILURE_KEY } }),
        ]);
        const marker = (0, backup_status_1.parseBackupMarker)(success?.value);
        return {
            ...(0, backup_status_1.evaluateBackupFreshness)(marker?.completedAt ?? null),
            lastFailureAt: (0, backup_status_1.parseBackupFailureAt)(failure?.value),
        };
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "check", null);
__decorate([
    (0, common_1.Get)('ready'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "ready", null);
__decorate([
    (0, common_1.Get)('live'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "live", null);
__decorate([
    (0, common_1.Get)('details'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('reports', 'read'),
    (0, terminus_1.HealthCheck)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "details", null);
__decorate([
    (0, common_1.Get)('integrations'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('reports', 'read'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "integrations", null);
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)('health'),
    __metadata("design:paramtypes", [terminus_1.HealthCheckService,
        terminus_1.PrismaHealthIndicator,
        terminus_1.MemoryHealthIndicator,
        prisma_service_1.PrismaService,
        config_1.ConfigService])
], HealthController);
//# sourceMappingURL=health.controller.js.map