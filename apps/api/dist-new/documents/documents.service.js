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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentsService = void 0;
const common_1 = require("@nestjs/common");
const pdf_lib_1 = require("pdf-lib");
const fontkit_1 = __importDefault(require("@pdf-lib/fontkit"));
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
const event_types_1 = require("../audit/event-types");
const roboto_font_1 = require("./roboto-font");
const order_invoice_1 = require("./order-invoice");
const trade_in_contract_1 = require("./trade-in-contract");
let DocumentsService = class DocumentsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.fontBytes = Buffer.from(roboto_font_1.ROBOTO_REGULAR_BASE64, 'base64');
    }
    async orderInvoice(orderId) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { customer: true, items: true, payments: true },
        });
        if (!order) {
            throw new errors_1.ValidationError('order_not_found', `Заказ ${orderId} не найден`);
        }
        const skus = order.items.map((item) => item.sku);
        const products = await this.prisma.product.findMany({
            where: { sku: { in: skus } },
            select: { sku: true, name: true },
        });
        const nameBySku = new Map(products.map((product) => [product.sku, product.name]));
        const lines = (0, order_invoice_1.buildOrderInvoiceLines)({
            id: order.id,
            status: order.status,
            channel: order.channel,
            total: order.total,
            createdAt: order.createdAt,
            customer: { name: order.customer.name, phone: order.customer.phone },
            items: order.items.map((item) => ({
                sku: item.sku,
                name: nameBySku.get(item.sku) ?? item.sku,
                qty: item.qty,
                price: item.price,
                imei: item.imei,
            })),
            payments: order.payments.map((payment) => ({
                method: payment.method,
                amount: payment.amount,
                status: payment.status,
            })),
        });
        return this.renderLines(lines);
    }
    async tradeInContract(tradeInId) {
        const trade = await this.prisma.tradeInDevice.findUnique({
            where: { id: tradeInId },
            include: { customer: true },
        });
        if (!trade) {
            throw new errors_1.ValidationError('tradein_not_found', `Скупка ${tradeInId} не найдена`);
        }
        return this.renderLines((0, trade_in_contract_1.buildTradeInContractLines)({
            id: trade.id,
            contractId: trade.contractId,
            issuedAt: new Date(),
            customer: { name: trade.customer.name, phone: trade.customer.phone },
            sellerPassport: trade.sellerPassport,
            model: trade.model,
            imei: trade.imei,
            grade: trade.grade,
            price: trade.price,
        }));
    }
    async warrantyTalon(imei) {
        const unit = await this.prisma.deviceUnit.findUnique({
            where: { imei },
            include: { product: true },
        });
        if (!unit) {
            throw new errors_1.ValidationError('unit_not_found', `IMEI ${imei} не найден`);
        }
        const order = unit.orderId
            ? await this.prisma.order.findUnique({
                where: { id: unit.orderId },
                include: { customer: true },
            })
            : null;
        const doc = await pdf_lib_1.PDFDocument.create();
        doc.registerFontkit(fontkit_1.default);
        const font = await doc.embedFont(this.fontBytes);
        const page = doc.addPage([595.28, 841.89]);
        const writer = this.lineWriter(page, font);
        writer('ГАРАНТИЙНЫЙ ТАЛОН', 16, 28);
        writer('AliStore · г. Бишкек, Кыргызстан', 11, 26);
        writer('Устройство:', 12, 18);
        writer(`  ${unit.product.name}`, 11, 16);
        writer(`  IMEI / SN: ${unit.imei}`, 11, 16);
        if (unit.grade) {
            writer(`  Состояние (грейд): ${unit.grade}`, 11, 16);
        }
        if (order?.customer) {
            writer('Покупатель:', 12, 18);
            writer(`  ${order.customer.name} · тел. ${order.customer.phone}`, 11, 16);
            writer(`  Дата продажи: ${order.createdAt.toISOString().slice(0, 10)}`, 11, 20);
        }
        writer(`Дата выдачи: ${new Date().toISOString().slice(0, 10)}`, 11, 18);
        writer('Гарантийный срок: 12 месяцев с даты продажи.', 11, 24);
        writer('Условия:', 12, 16);
        writer('— гарантия не покрывает механические повреждения, попадание', 10, 14);
        writer('  влаги и следы вскрытия неавторизованным сервисом;', 10, 14);
        writer('— при обращении предъявите талон и устройство.', 10, 28);
        writer('Подпись продавца: __________________     Печать: ______', 10, 16);
        const bytes = await doc.save();
        return {
            pdfBase64: Buffer.from(bytes).toString('base64'),
            bytes: bytes.length,
        };
    }
    async writeOffAct(movementId) {
        const movement = await this.prisma.inventoryMovement.findUnique({
            where: { id: movementId },
            include: { product: true },
        });
        if (!movement) {
            throw new errors_1.ValidationError('movement_not_found', `Движение ${movementId} не найдено`);
        }
        if (movement.type !== 'write_off') {
            throw new errors_1.ValidationError('not_a_writeoff', `Движение ${movementId} — не списание`);
        }
        const doc = await pdf_lib_1.PDFDocument.create();
        doc.registerFontkit(fontkit_1.default);
        const font = await doc.embedFont(this.fontBytes);
        const page = doc.addPage([595.28, 841.89]);
        const writer = this.lineWriter(page, font);
        writer('АКТ СПИСАНИЯ товара', 16, 28);
        writer('AliStore · г. Бишкек, Кыргызстан', 11, 26);
        writer(`№ ${movement.id}`, 10, 16);
        writer(`Дата: ${movement.createdAt.toISOString().slice(0, 10)}`, 10, 24);
        writer('Товар:', 12, 18);
        writer(`  ${movement.product.name} (SKU ${movement.product.sku})`, 11, 16);
        writer(`  Количество: ${Math.abs(movement.qty)} шт.`, 11, 16);
        writer(`  Причина: ${movement.reason ?? '—'}`, 11, 24);
        writer('Списание согласовано (approval) и зафиксировано в Event Ledger.', 10, 24);
        writer('Ответственный: __________________     Владелец: __________________', 10, 16);
        const bytes = await doc.save();
        return {
            pdfBase64: Buffer.from(bytes).toString('base64'),
            bytes: bytes.length,
        };
    }
    async writeOffActByApproval(approvalId) {
        const event = await this.prisma.auditEvent.findFirst({
            where: {
                type: event_types_1.EventType.StockWrittenOff,
                payload: { path: ['approvalId'], equals: approvalId },
            },
            orderBy: { ts: 'desc' },
        });
        const movementId = event?.payload?.movementId;
        if (!event || typeof movementId !== 'string') {
            throw new errors_1.ValidationError('writeoff_not_found', `Списание по approval ${approvalId} не найдено`);
        }
        return this.writeOffAct(movementId);
    }
    async returnAct(returnId) {
        const ret = await this.prisma.return.findUnique({ where: { id: returnId } });
        if (!ret) {
            throw new errors_1.ValidationError('return_not_found', `Возврат ${returnId} не найден`);
        }
        const order = await this.prisma.order.findUnique({
            where: { id: ret.orderId },
            include: { customer: true },
        });
        const doc = await pdf_lib_1.PDFDocument.create();
        doc.registerFontkit(fontkit_1.default);
        const font = await doc.embedFont(this.fontBytes);
        const page = doc.addPage([595.28, 841.89]);
        const writer = this.lineWriter(page, font);
        writer('АКТ ВОЗВРАТА товара', 16, 28);
        writer('AliStore · г. Бишкек, Кыргызстан', 11, 26);
        writer(`№ ${ret.id}`, 10, 16);
        writer(`Дата: ${ret.createdAt.toISOString().slice(0, 10)}`, 10, 24);
        writer(`Заказ: ${ret.orderId}`, 11, 16);
        if (order?.customer) {
            writer(`Клиент: ${order.customer.name} · тел. ${order.customer.phone}`, 11, 16);
        }
        writer(`Причина возврата: ${ret.reason}`, 11, 16);
        writer(`Статус: ${ret.status}`, 11, 24);
        writer('Возврат денег — по approval, тем же способом оплаты.', 10, 24);
        writer('Принял: __________________     Клиент: __________________', 10, 16);
        const bytes = await doc.save();
        return {
            pdfBase64: Buffer.from(bytes).toString('base64'),
            bytes: bytes.length,
        };
    }
    async renderLines(lines) {
        const doc = await pdf_lib_1.PDFDocument.create();
        doc.registerFontkit(fontkit_1.default);
        const font = await doc.embedFont(this.fontBytes);
        const page = doc.addPage([595.28, 841.89]);
        const writer = this.lineWriter(page, font);
        for (const line of lines) {
            writer(line || ' ', line ? 10.5 : 8, line ? 15 : 8);
        }
        const bytes = await doc.save();
        return {
            pdfBase64: Buffer.from(bytes).toString('base64'),
            bytes: bytes.length,
        };
    }
    lineWriter(page, font) {
        let y = page.getSize().height - 60;
        return (text, size = 11, gap = 18) => {
            page.drawText(text, {
                x: 50,
                y,
                size,
                font,
                color: (0, pdf_lib_1.rgb)(0.08, 0.09, 0.11),
            });
            y -= gap;
        };
    }
};
exports.DocumentsService = DocumentsService;
exports.DocumentsService = DocumentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DocumentsService);
//# sourceMappingURL=documents.service.js.map