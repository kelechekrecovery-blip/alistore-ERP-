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
exports.SentryExceptionFilter = void 0;
exports.isCriticalException = isCriticalException;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const alerter_service_1 = require("./alerter.service");
const error_reporter_1 = require("./error-reporter");
function isCriticalException(exception) {
    if (exception instanceof common_1.HttpException)
        return exception.getStatus() >= 500;
    return true;
}
let SentryExceptionFilter = class SentryExceptionFilter extends core_1.BaseExceptionFilter {
    constructor(reporter, alerter) {
        super();
        this.reporter = reporter;
        this.alerter = alerter;
    }
    catch(exception, host) {
        this.reporter.capture(exception);
        if (isCriticalException(exception)) {
            const request = host.switchToHttp().getRequest();
            const route = `${request?.method ?? 'HTTP'} ${(request?.originalUrl ?? request?.url ?? '').split('?')[0] || 'unknown'}`;
            const name = exception instanceof Error ? exception.name : 'Error';
            this.alerter.notifyCritical({
                source: 'api',
                message: `Unhandled ${name} on ${route}`,
                error: exception,
            });
        }
        super.catch(exception, host);
    }
};
exports.SentryExceptionFilter = SentryExceptionFilter;
exports.SentryExceptionFilter = SentryExceptionFilter = __decorate([
    (0, common_1.Catch)(),
    __metadata("design:paramtypes", [error_reporter_1.ErrorReporter,
        alerter_service_1.AlerterService])
], SentryExceptionFilter);
//# sourceMappingURL=sentry-exception.filter.js.map