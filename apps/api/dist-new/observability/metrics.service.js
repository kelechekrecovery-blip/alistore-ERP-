"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsService = void 0;
const common_1 = require("@nestjs/common");
const BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
let MetricsService = class MetricsService {
    constructor() {
        this.startedAt = Date.now();
        this.requests = new Map();
    }
    recordRequest(method, route, statusCode, durationMs) {
        const normalizedMethod = method.toUpperCase();
        const normalizedRoute = this.normalizeRoute(route);
        const status = String(statusCode || 500);
        const key = `${normalizedMethod}\u0000${normalizedRoute}\u0000${status}`;
        const durationSeconds = Math.max(0, durationMs) / 1000;
        const metric = this.requests.get(key) ?? {
            count: 0,
            errorCount: 0,
            durationSeconds: 0,
            buckets: BUCKETS.map(() => 0),
        };
        metric.count += 1;
        metric.errorCount += statusCode >= 500 ? 1 : 0;
        metric.durationSeconds += durationSeconds;
        metric.buckets = metric.buckets.map((value, index) => durationSeconds <= BUCKETS[index] ? value + 1 : value);
        this.requests.set(key, metric);
    }
    snapshot() {
        let requestsTotal = 0;
        let errors5xxTotal = 0;
        for (const metric of this.requests.values()) {
            requestsTotal += metric.count;
            errors5xxTotal += metric.errorCount;
        }
        return {
            startedAt: new Date(this.startedAt).toISOString(),
            uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
            requestsTotal,
            errors5xxTotal,
        };
    }
    renderPrometheus() {
        const lines = [
            '# HELP alistore_process_start_time_seconds Unix timestamp of process start.',
            '# TYPE alistore_process_start_time_seconds gauge',
            `alistore_process_start_time_seconds ${(this.startedAt / 1000).toFixed(3)}`,
            '# HELP alistore_http_requests_total Total HTTP requests handled by the API.',
            '# TYPE alistore_http_requests_total counter',
            '# HELP alistore_http_request_errors_total Total HTTP 5xx responses.',
            '# TYPE alistore_http_request_errors_total counter',
            '# HELP alistore_http_request_duration_seconds HTTP request duration.',
            '# TYPE alistore_http_request_duration_seconds histogram',
        ];
        for (const [key, metric] of [...this.requests.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            const [method, route, status] = key.split('\u0000');
            const labels = `method="${this.escapeLabel(method)}",route="${this.escapeLabel(route)}",status="${this.escapeLabel(status)}"`;
            lines.push(`alistore_http_requests_total{${labels}} ${metric.count}`);
            lines.push(`alistore_http_request_errors_total{${labels}} ${metric.errorCount}`);
            BUCKETS.forEach((bucket, index) => {
                lines.push(`alistore_http_request_duration_seconds_bucket{${labels},le="${bucket}"} ${metric.buckets[index]}`);
            });
            lines.push(`alistore_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${metric.count}`);
            lines.push(`alistore_http_request_duration_seconds_sum{${labels}} ${metric.durationSeconds.toFixed(6)}`);
            lines.push(`alistore_http_request_duration_seconds_count{${labels}} ${metric.count}`);
        }
        lines.push('');
        return lines.join('\n');
    }
    normalizeRoute(route) {
        const value = route || '/unknown';
        return value
            .split('?')[0]
            .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
            .replace(/\/\d+(?=\/|$)/g, '/:id');
    }
    escapeLabel(value) {
        return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
    }
};
exports.MetricsService = MetricsService;
exports.MetricsService = MetricsService = __decorate([
    (0, common_1.Injectable)()
], MetricsService);
//# sourceMappingURL=metrics.service.js.map