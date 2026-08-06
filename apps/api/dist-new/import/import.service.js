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
exports.ImportService = void 0;
const common_1 = require("@nestjs/common");
const exceljs_1 = require("exceljs");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const REQUIRED = ['sku', 'name', 'price', 'cost', 'category'];
const HEADER_ALIASES = {
    sku: ['sku', 'артикул', 'код'],
    name: ['name', 'наименование', 'название', 'товар'],
    price: ['price', 'цена', 'розница'],
    cost: ['cost', 'себестоимость', 'закуп', 'закупка'],
    category: ['category', 'категория', 'раздел'],
    tracking_mode: ['tracking_mode', 'trackingmode', 'учёт', 'учет', 'тип учёта', 'тип учета'],
};
let ImportService = class ImportService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async parseProducts(buffer) {
        const wb = new exceljs_1.Workbook();
        await wb.xlsx.load(buffer);
        const ws = wb.worksheets[0];
        if (!ws) {
            throw new errors_1.ValidationError('empty_workbook', 'Пустой файл Excel');
        }
        const raw = {};
        ws.getRow(1).eachCell((cell, c) => {
            const header = String(cell.value ?? '').trim().toLowerCase();
            if (header)
                raw[header] = c;
        });
        const col = {};
        for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
            const hit = aliases.find((alias) => raw[alias] !== undefined);
            if (hit)
                col[canonical] = raw[hit];
        }
        const missing = REQUIRED.filter((h) => !col[h]);
        if (missing.length) {
            throw new errors_1.ValidationError('missing_columns', `Нет обязательных колонок: ${missing.join(', ')}`);
        }
        const rows = [];
        const errors = [];
        for (let r = 2; r <= ws.rowCount; r += 1) {
            const row = ws.getRow(r);
            const sku = this.str(row.getCell(col.sku).value);
            if (!sku)
                continue;
            const name = this.str(row.getCell(col.name).value);
            const price = this.num(row.getCell(col.price).value);
            const cost = this.num(row.getCell(col.cost).value);
            const category = this.str(row.getCell(col.category).value) || 'misc';
            if (!name || price === null || cost === null) {
                errors.push({
                    row: r,
                    sku,
                    message: 'name обязателен; price/cost — числа',
                });
                continue;
            }
            const rawMode = col.tracking_mode ? this.str(row.getCell(col.tracking_mode).value).toLowerCase() : '';
            const trackingMode = rawMode === 'serialized' || rawMode === 'серийный' || rawMode === 'imei'
                ? 'serialized'
                : 'quantity';
            rows.push({ sku, name, price, cost, category, trackingMode });
        }
        return { rows, errors };
    }
    async importProducts(buffer, actor = 'import') {
        const { rows, errors } = await this.parseProducts(buffer);
        const audit = this.audit ?? new audit_service_1.AuditService(this.prisma);
        let created = 0;
        let updated = 0;
        let unchanged = 0;
        for (const p of rows) {
            const outcome = await audit.transaction(async (tx) => {
                const existing = await tx.product.findUnique({
                    where: { sku: p.sku },
                });
                if (!existing) {
                    const product = await tx.product.create({
                        data: {
                            sku: p.sku,
                            name: p.name,
                            price: p.price,
                            cost: p.cost,
                            category: p.category,
                            trackingMode: p.trackingMode,
                            attrs: {},
                        },
                    });
                    return {
                        result: 'created',
                        events: [
                            {
                                type: event_types_1.EventType.ProductCreated,
                                actor,
                                payload: {
                                    productId: product.id,
                                    sku: p.sku,
                                    name: p.name,
                                    price: p.price,
                                    cost: p.cost,
                                    category: p.category,
                                },
                                refs: [product.id, p.sku],
                            },
                        ],
                    };
                }
                if (existing.name === p.name &&
                    existing.price === p.price &&
                    existing.cost === p.cost &&
                    existing.category === p.category) {
                    return { result: 'unchanged', events: [] };
                }
                const product = await tx.product.update({
                    where: { sku: p.sku },
                    data: {
                        sku: p.sku,
                        name: p.name,
                        price: p.price,
                        cost: p.cost,
                        category: p.category,
                    },
                });
                const events = [
                    {
                        type: event_types_1.EventType.ProductUpdated,
                        actor,
                        payload: {
                            productId: product.id,
                            sku: p.sku,
                            changes: ['name', 'price', 'cost', 'category'].filter((field) => existing[field] !== p[field]),
                        },
                        refs: [product.id, p.sku],
                    },
                ];
                if (existing.price !== p.price) {
                    events.push({
                        type: event_types_1.EventType.PriceChanged,
                        actor,
                        payload: { productId: product.id, from: existing.price, to: p.price },
                        refs: [product.id, p.sku],
                    });
                }
                return { result: 'updated', events };
            });
            if (outcome === 'created')
                created += 1;
            else if (outcome === 'updated')
                updated += 1;
            else
                unchanged += 1;
        }
        return { created, updated, unchanged, errors };
    }
    str(value) {
        return value === null || value === undefined ? '' : String(value).trim();
    }
    num(value) {
        if (value === null || value === undefined || value === '')
            return null;
        const n = Number(value);
        return Number.isFinite(n) ? Math.round(n) : null;
    }
};
exports.ImportService = ImportService;
exports.ImportService = ImportService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], ImportService);
//# sourceMappingURL=import.service.js.map