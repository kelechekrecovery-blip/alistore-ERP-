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
exports.MetricsController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const metrics_service_1 = require("./metrics.service");
let MetricsController = class MetricsController {
    constructor(metrics, config) {
        this.metrics = metrics;
        this.config = config;
    }
    getMetrics(request) {
        this.assertAccess(request);
        return this.metrics.renderPrometheus();
    }
    assertAccess(request) {
        if (this.config.get('NODE_ENV') !== 'production')
            return;
        const configuredToken = this.config.get('METRICS_TOKEN');
        const authorization = request.headers.authorization;
        if (!configuredToken || authorization !== `Bearer ${configuredToken}`) {
            throw new common_1.UnauthorizedException('Metrics authorization required');
        }
    }
};
exports.MetricsController = MetricsController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.Header)('Content-Type', 'text/plain; version=0.0.4; charset=utf-8'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", String)
], MetricsController.prototype, "getMetrics", null);
exports.MetricsController = MetricsController = __decorate([
    (0, common_1.Controller)('metrics'),
    __metadata("design:paramtypes", [metrics_service_1.MetricsService,
        config_1.ConfigService])
], MetricsController);
//# sourceMappingURL=metrics.controller.js.map