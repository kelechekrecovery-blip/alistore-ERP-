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
exports.ReceiptsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const receiptline_1 = require("receiptline");
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
const CPL = 42;
const ENCODING = 'cp866';
let ReceiptsService = class ReceiptsService {
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
    }
    async renderOrder(orderId) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { items: true, payments: true },
        });
        if (!order) {
            throw new errors_1.ValidationError('order_not_found', `Заказ ${orderId} не найден`);
        }
        const skus = order.items.map((item) => item.sku);
        const products = await this.prisma.product.findMany({
            where: { sku: { in: skus } },
        });
        const nameBySku = new Map(products.map((p) => [p.sku, p.name]));
        return this.render({
            store: {
                name: this.config.get('STORE_NAME') ?? 'AliStore',
                address: this.config.get('STORE_ADDRESS') ?? 'Бишкек',
                phone: this.config.get('STORE_PHONE'),
            },
            orderId: order.id,
            issuedAt: order.createdAt.toISOString(),
            items: order.items.map((item) => ({
                name: nameBySku.get(item.sku) ?? item.sku,
                qty: item.qty,
                price: item.price,
            })),
            total: order.total,
            payment: order.payments[0]?.method ?? 'cash',
            payments: order.payments
                .filter((payment) => payment.amount > 0 && ['received', 'reconciled'].includes(payment.status))
                .map((payment) => ({
                method: payment.method,
                amount: payment.amount,
            })),
        });
    }
    buildMarkup(data) {
        const lines = [`^^^${data.store.name}`];
        if (data.store.address)
            lines.push(data.store.address);
        if (data.store.phone)
            lines.push(data.store.phone);
        lines.push(`Чек ${data.orderId}`, this.formatDate(data.issuedAt));
        if (data.cashier)
            lines.push(`Кассир: ${data.cashier}`);
        lines.push('Информационный чек — фискализация не выполнена');
        lines.push('---');
        for (const item of data.items) {
            const lineTotal = item.qty * item.price;
            lines.push(item.name);
            lines.push(` ${item.qty} x ${this.money(item.price)} | ${this.money(lineTotal)}`);
        }
        lines.push('---', `^ИТОГО | ${this.money(data.total)}`);
        if (data.payments?.length) {
            lines.push('Оплата:');
            for (const payment of data.payments) {
                lines.push(` ${payment.method} | ${this.money(payment.amount)}`);
            }
        }
        else {
            lines.push(`Оплата: ${data.payment}`);
        }
        lines.push('', 'Спасибо за покупку!');
        return lines.join('\n');
    }
    render(data) {
        const markup = this.buildMarkup(data);
        const printer = { cpl: CPL, encoding: ENCODING };
        const svg = (0, receiptline_1.transform)(markup, { ...printer, command: 'svg' });
        const escpos = (0, receiptline_1.transform)(markup, { ...printer, command: 'escpos' });
        return {
            markup,
            svg,
            escposBase64: Buffer.from(escpos, 'binary').toString('base64'),
            fiscal: {
                status: 'informational',
                fiscalNumber: null,
                qrPayload: null,
                providerReference: null,
            },
        };
    }
    money(value) {
        return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
    formatDate(iso) {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime()))
            return iso;
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
};
exports.ReceiptsService = ReceiptsService;
exports.ReceiptsService = ReceiptsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], ReceiptsService);
//# sourceMappingURL=receipts.service.js.map