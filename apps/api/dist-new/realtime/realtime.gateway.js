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
exports.RealtimeGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const socket_io_1 = require("socket.io");
const auth_service_1 = require("../auth/auth.service");
const authz_service_1 = require("../authz/authz.service");
const staff_auth_service_1 = require("../staff-auth/staff-auth.service");
const prisma_service_1 = require("../prisma/prisma.service");
let RealtimeGateway = class RealtimeGateway {
    constructor(auth, prisma, staffAuth, authz) {
        this.auth = auth;
        this.prisma = prisma;
        this.staffAuth = staffAuth;
        this.authz = authz;
    }
    afterInit(server) {
        server.use(async (client, next) => {
            try {
                const token = this.readToken(client);
                if (!token || !this.auth)
                    throw new Error('missing_access_token');
                const principal = await this.auth.verifyAccessToken(token);
                if (principal.typ === 'staff') {
                    await this.assertStaffQueueAccess(principal);
                }
                client.data.principal = principal;
                next();
            }
            catch {
                next(new Error('unauthorized'));
            }
        });
    }
    async subscribeOrder(client, orderId) {
        const principal = client.data.principal;
        if (!principal || !this.prisma)
            throw new websockets_1.WsException('unauthorized');
        const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
        if (!order)
            throw new websockets_1.WsException('order_not_found');
        if (principal.typ === 'customer' && order.customerId !== principal.customerId) {
            throw new websockets_1.WsException('order_not_found');
        }
        if (principal.typ === 'staff')
            await this.assertStaffQueueAccess(principal);
        client.join(`order:${orderId}`);
        return { subscribed: orderId };
    }
    emitOrderStatus(orderId, status, payload = {}) {
        if (!this.server)
            return;
        this.server
            .to(`order:${orderId}`)
            .emit('order:status', { orderId, status, ...payload });
    }
    readToken(client) {
        const authToken = client.handshake.auth?.token;
        if (typeof authToken === 'string' && authToken.trim())
            return authToken.trim();
        const header = client.handshake.headers.authorization;
        if (typeof header === 'string' && header.startsWith('Bearer '))
            return header.slice(7).trim();
        return undefined;
    }
    async assertStaffQueueAccess(principal) {
        if (principal.typ !== 'staff' || !principal.role || !this.staffAuth || !this.authz) {
            throw new Error('staff_authorization_unavailable');
        }
        await this.staffAuth.me(principal.customerId);
        if (!(await this.authz.can(principal.role, 'orders', 'queue'))) {
            throw new Error('staff_order_access_denied');
        }
    }
};
exports.RealtimeGateway = RealtimeGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RealtimeGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('subscribe:order'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "subscribeOrder", null);
exports.RealtimeGateway = RealtimeGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: process.env.NODE_ENV === 'production'
                ? (process.env.CORS_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)
                : true,
            credentials: true,
        },
    }),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        prisma_service_1.PrismaService,
        staff_auth_service_1.StaffAuthService,
        authz_service_1.AuthzService])
], RealtimeGateway);
//# sourceMappingURL=realtime.gateway.js.map