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
exports.SupplierPriceImportService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const audit_service_1 = require("../../audit/audit.service");
const event_types_1 = require("../../audit/event-types");
const errors_1 = require("../../common/errors");
const supplier_price_import_parser_1 = require("./supplier-price-import.parser");
let SupplierPriceImportService = class SupplierPriceImportService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async stage(file, supplierId, mappingInput, actor) {
        const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
        if (!supplier) {
            throw new errors_1.ValidationError('supplier_not_found', `Поставщик ${supplierId} не найден`);
        }
        const mapping = await this.resolveMapping(supplierId, mappingInput);
        const rawRows = await (0, supplier_price_import_parser_1.parseSupplierPriceList)(file, mapping);
        const skus = Array.from(new Set(rawRows.filter((r) => !r.error).map((r) => r.sku)));
        const barcodes = Array.from(new Set(rawRows.filter((r) => !r.error && r.barcode).map((r) => r.barcode)));
        const products = await this.prisma.product.findMany({
            where: { OR: [{ sku: { in: skus } }, ...(barcodes.length ? [{ barcode: { in: barcodes } }] : [])] },
            select: { id: true, sku: true, barcode: true, cost: true, supplyLeadDays: true, supplierId: true },
        });
        const { rows, summary } = (0, supplier_price_import_parser_1.classifySupplierPriceRows)(rawRows, products, supplierId);
        const batch = await this.audit.transaction(async (tx) => {
            const created = await tx.supplierPriceImportBatch.create({
                data: {
                    supplierId,
                    mapping: mapping,
                    rows: rows,
                    summary: summary,
                    createdBy: actor,
                },
            });
            const events = [
                {
                    type: event_types_1.EventType.SupplierPriceImportStaged,
                    actor,
                    payload: { batchId: created.id, supplierId, ...summary },
                    refs: [created.id, supplierId],
                },
            ];
            return { result: created, events };
        });
        return { batchId: batch.id, supplierId, mapping, rows, summary };
    }
    async get(batchId) {
        const batch = await this.prisma.supplierPriceImportBatch.findUnique({
            where: { id: batchId },
            include: { application: true },
        });
        if (!batch)
            throw new errors_1.ValidationError('batch_not_found', `Батч ${batchId} не найден`);
        return {
            batchId: batch.id,
            supplierId: batch.supplierId,
            mapping: batch.mapping,
            rows: batch.rows,
            summary: batch.summary,
            applied: batch.application !== null,
        };
    }
    async apply(batchId, actor) {
        return this.audit.transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${`supplier-price-import:${batchId}`}))`;
            const batch = await tx.supplierPriceImportBatch.findUnique({
                where: { id: batchId },
                include: { application: true },
            });
            if (!batch)
                throw new errors_1.ValidationError('batch_not_found', `Батч ${batchId} не найден`);
            if (batch.application) {
                const summary = batch.application.summary;
                return { result: { batchId, idempotent: true, ...summary }, events: [] };
            }
            const rows = batch.rows;
            const toApply = rows.filter((r) => r.changedFields.length > 0 && r.matchedProductId);
            const events = [];
            let appliedCount = 0;
            for (const row of toApply) {
                const product = await tx.product.findUnique({ where: { id: row.matchedProductId } });
                if (!product)
                    continue;
                const data = {};
                if (row.changedFields.includes('cost') && row.newCost !== null)
                    data.cost = row.newCost;
                if (row.changedFields.includes('supplyLeadDays'))
                    data.supplyLeadDays = row.newLeadDays;
                if (row.changedFields.includes('supplierId'))
                    data.supplier = { connect: { id: batch.supplierId } };
                if (Object.keys(data).length === 0)
                    continue;
                await tx.product.update({ where: { id: product.id }, data });
                appliedCount += 1;
                if (row.changedFields.includes('cost') && row.newCost !== null) {
                    events.push({
                        type: event_types_1.EventType.ProductCostChanged,
                        actor,
                        payload: {
                            productId: product.id,
                            sku: product.sku,
                            from: product.cost,
                            to: row.newCost,
                            deltaPct: product.cost === 0
                                ? null
                                : Math.round(((row.newCost - product.cost) / product.cost) * 1000) / 10,
                            batchId,
                        },
                        refs: [product.id, product.sku, batchId],
                    });
                }
                const otherChanges = row.changedFields.filter((f) => f !== 'cost');
                if (otherChanges.length > 0) {
                    events.push({
                        type: event_types_1.EventType.ProductUpdated,
                        actor,
                        payload: {
                            productId: product.id,
                            sku: product.sku,
                            changes: otherChanges,
                            from: {
                                supplyLeadDays: product.supplyLeadDays,
                                supplierId: product.supplierId,
                            },
                            to: {
                                supplyLeadDays: otherChanges.includes('supplyLeadDays') ? row.newLeadDays : product.supplyLeadDays,
                                supplierId: otherChanges.includes('supplierId') ? batch.supplierId : product.supplierId,
                            },
                            batchId,
                        },
                        refs: [product.id, product.sku, batchId],
                    });
                }
            }
            const summary = {
                total: rows.length,
                applied: appliedCount,
                unmatched: rows.filter((r) => r.type === 'unmatched').length,
                ambiguous: rows.filter((r) => r.type === 'ambiguous').length,
                invalid: rows.filter((r) => r.type === 'invalid').length,
                noChange: rows.filter((r) => r.type === 'no_change').length,
            };
            events.push({
                type: event_types_1.EventType.SupplierPriceImportApplied,
                actor,
                payload: { batchId, supplierId: batch.supplierId, ...summary },
                refs: [batchId, batch.supplierId],
            });
            await tx.supplierPriceImportApplication.create({
                data: { batchId, appliedBy: actor, summary: summary },
            });
            return { result: { batchId, idempotent: false, ...summary }, events };
        });
    }
    async resolveMapping(supplierId, mappingInput) {
        if (mappingInput) {
            if (!mappingInput.sku?.trim() || !mappingInput.price?.trim()) {
                throw new errors_1.ValidationError('mapping_incomplete', 'mapping обязан задавать sku и price');
            }
            return mappingInput;
        }
        const last = await this.prisma.supplierPriceImportBatch.findFirst({
            where: { supplierId },
            orderBy: { createdAt: 'desc' },
            select: { mapping: true },
        });
        if (!last) {
            throw new errors_1.ValidationError('mapping_required', 'Для этого поставщика ещё нет сохранённого mapping колонок — укажите его явно');
        }
        return last.mapping;
    }
};
exports.SupplierPriceImportService = SupplierPriceImportService;
exports.SupplierPriceImportService = SupplierPriceImportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], SupplierPriceImportService);
//# sourceMappingURL=supplier-price-import.service.js.map