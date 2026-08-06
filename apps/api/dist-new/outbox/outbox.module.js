"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const authz_module_1 = require("../authz/authz.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const outbox_service_1 = require("./outbox.service");
const outbox_controller_1 = require("./outbox.controller");
const outbox_relay_1 = require("./outbox.relay");
const log_transport_1 = require("./transports/log.transport");
const notification_transport_selector_1 = require("./notification-transport-selector");
const novu_transport_1 = require("./transports/novu.transport");
const email_transport_1 = require("./transports/email.transport");
const realtime_transport_1 = require("./transports/realtime.transport");
const channel_transport_1 = require("./transports/channel.transport");
const realtime_module_1 = require("../realtime/realtime.module");
const realtime_gateway_1 = require("../realtime/realtime.gateway");
const observability_module_1 = require("../observability/observability.module");
const outbox_types_1 = require("./outbox.types");
const prisma_service_1 = require("../prisma/prisma.service");
let OutboxModule = class OutboxModule {
};
exports.OutboxModule = OutboxModule;
exports.OutboxModule = OutboxModule = __decorate([
    (0, common_1.Module)({
        imports: [realtime_module_1.RealtimeModule, observability_module_1.ObservabilityModule, staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule],
        controllers: [outbox_controller_1.OutboxController],
        providers: [
            outbox_service_1.OutboxService,
            outbox_relay_1.OutboxRelay,
            {
                provide: outbox_types_1.NOTIFICATION_TRANSPORT,
                inject: [config_1.ConfigService, realtime_gateway_1.RealtimeGateway, prisma_service_1.PrismaService],
                useFactory: (config, gateway, prisma) => {
                    return (0, notification_transport_selector_1.selectNotificationTransport)((name) => config.get(name), {
                        channels: () => new channel_transport_1.ChannelNotificationTransport(config, prisma),
                        novu: () => new novu_transport_1.NovuHttpTransport(config),
                        email: () => new email_transport_1.EmailNotificationTransport(config),
                        realtime: () => new realtime_transport_1.RealtimeNotificationTransport(gateway),
                        log: () => new log_transport_1.LogNotificationTransport(),
                    });
                },
            },
        ],
        exports: [outbox_service_1.OutboxService],
    })
], OutboxModule);
//# sourceMappingURL=outbox.module.js.map