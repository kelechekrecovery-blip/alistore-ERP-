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
exports.StatusController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const prisma_service_1 = require("../prisma/prisma.service");
const alerter_service_1 = require("./alerter.service");
const error_reporter_1 = require("./error-reporter");
const metrics_service_1 = require("./metrics.service");
const WORKER_STALE_AFTER_SECONDS = 5 * 60;
let StatusController = class StatusController {
    constructor(prisma, metrics, alerter, reporter) {
        this.prisma = prisma;
        this.metrics = metrics;
        this.alerter = alerter;
        this.reporter = reporter;
    }
    async status() {
        const [pending, failed, oldestPending, heartbeats] = await Promise.all([
            this.prisma.outboxMessage.count({ where: { status: 'pending' } }),
            this.prisma.outboxMessage.count({ where: { status: 'failed' } }),
            this.prisma.outboxMessage.findFirst({
                where: { status: 'pending' },
                orderBy: { createdAt: 'asc' },
                select: { createdAt: true },
            }),
            this.prisma.workerHeartbeat.findMany({ orderBy: { id: 'asc' } }),
        ]);
        const now = Date.now();
        const ageSeconds = (at) => Math.max(0, Math.floor((now - at.getTime()) / 1000));
        return {
            api: {
                status: 'ok',
                ...this.metrics.snapshot(),
            },
            sentry: { enabled: this.reporter.enabled },
            alerting: {
                enabled: this.alerter.enabled,
                suppressedCount: this.alerter.suppressedCount,
                recent: this.alerter.recentAlerts(20),
            },
            outbox: {
                pending,
                failed,
                oldestPendingAgeSeconds: oldestPending ? ageSeconds(oldestPending.createdAt) : null,
            },
            workers: heartbeats.map((heartbeat) => ({
                id: heartbeat.id,
                lastSeenAt: heartbeat.lastSeenAt.toISOString(),
                ageSeconds: ageSeconds(heartbeat.lastSeenAt),
                stale: ageSeconds(heartbeat.lastSeenAt) > WORKER_STALE_AFTER_SECONDS,
            })),
        };
    }
};
exports.StatusController = StatusController;
__decorate([
    (0, common_1.Get)('status'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Operations status: API/worker liveness, outbox/DLQ depth, recent critical alerts' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('observability', 'read'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], StatusController.prototype, "status", null);
exports.StatusController = StatusController = __decorate([
    (0, swagger_1.ApiTags)('observability'),
    (0, common_1.Controller)('observability'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        metrics_service_1.MetricsService,
        alerter_service_1.AlerterService,
        error_reporter_1.ErrorReporter])
], StatusController);
//# sourceMappingURL=status.controller.js.map