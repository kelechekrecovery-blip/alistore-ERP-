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
exports.SupplierRmaService = exports.RMA_SLA_DAYS = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const rma_state_1 = require("./rma-state");
const scorecard_1 = require("./scorecard");
exports.RMA_SLA_DAYS = 30;
const UNIT_EFFECT = {
    repaired: 'in_stock',
    replaced: 'in_stock',
    refunded: 'written_off',
    rejected: 'written_off',
};
let SupplierRmaService = class SupplierRmaService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    createSupplier(input) {
        return this.prisma.supplier.create({
            data: { name: input.name, contact: input.contact ?? null },
        });
    }
    listSuppliers() {
        return this.prisma.supplier.findMany({ orderBy: { name: 'asc' }, take: 100 });
    }
    listRmas(filter) {
        return this.prisma.supplierRma.findMany({
            where: {
                ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
                ...(filter.status ? { status: filter.status } : {}),
            },
            orderBy: { sla: 'asc' },
            take: 100,
        });
    }
    async open(input, actor) {
        const [supplier, unit] = await Promise.all([
            this.prisma.supplier.findUnique({ where: { id: input.supplierId } }),
            this.prisma.deviceUnit.findUnique({ where: { imei: input.imei } }),
        ]);
        if (!supplier) {
            throw new errors_1.ValidationError('supplier_not_found', `Поставщик ${input.supplierId} не найден`);
        }
        if (!unit) {
            throw new errors_1.ValidationError('unit_not_found', `Устройство ${input.imei} не найдено`);
        }
        const sla = new Date(Date.now() + exports.RMA_SLA_DAYS * 24 * 60 * 60 * 1000);
        return this.audit.transaction(async (tx) => {
            const rma = await tx.supplierRma.create({
                data: {
                    supplierId: input.supplierId,
                    imei: input.imei,
                    defect: input.defect,
                    status: 'created',
                    sla,
                },
            });
            const claimed = await tx.deviceUnit.updateMany({
                where: { imei: input.imei, status: 'in_stock' },
                data: { status: 'in_repair' },
            });
            if (claimed.count !== 1) {
                throw new errors_1.ConflictError('rma_unit_not_in_stock', `Устройство ${input.imei} не в свободном остатке — RMA открыть нельзя`);
            }
            return {
                result: rma,
                events: [
                    {
                        type: event_types_1.EventType.RmaOpened,
                        actor,
                        payload: { rmaId: rma.id, supplierId: input.supplierId, imei: input.imei, sla: sla.toISOString() },
                        refs: [rma.id, input.imei, input.supplierId],
                    },
                ],
            };
        });
    }
    async transition(id, to, actor) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "SupplierRma" WHERE id = ${id} FOR UPDATE`;
            const rma = await tx.supplierRma.findUnique({ where: { id } });
            if (!rma) {
                throw new errors_1.ValidationError('rma_not_found', `RMA ${id} не найдена`);
            }
            (0, rma_state_1.assertRmaTransition)(rma.status, to);
            const isResolution = rma_state_1.RMA_RESOLUTIONS.includes(to);
            const updated = await tx.supplierRma.update({
                where: { id },
                data: { status: to, ...(isResolution ? { resolution: to } : {}) },
            });
            const unitEffect = UNIT_EFFECT[to];
            if (unitEffect) {
                const applied = await tx.deviceUnit.updateMany({
                    where: { imei: rma.imei, status: 'in_repair' },
                    data: { status: unitEffect },
                });
                if (applied.count !== 1) {
                    throw new errors_1.ConflictError('rma_unit_effect_lost', `Устройство ${rma.imei} уже покинуло ремонт — разрешение RMA не применено`);
                }
            }
            return {
                result: updated,
                events: [
                    {
                        type: eventForTarget(to),
                        actor,
                        payload: { rmaId: id, from: rma.status, to },
                        refs: [id, rma.imei, rma.supplierId],
                    },
                ],
            };
        });
    }
    async scorecard() {
        const [suppliers, rmas] = await Promise.all([
            this.prisma.supplier.findMany({ orderBy: { name: 'asc' } }),
            this.prisma.supplierRma.findMany({ select: { supplierId: true, status: true, resolution: true } }),
        ]);
        return (0, scorecard_1.buildScorecard)(suppliers, rmas);
    }
};
exports.SupplierRmaService = SupplierRmaService;
exports.SupplierRmaService = SupplierRmaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], SupplierRmaService);
function eventForTarget(to) {
    if (to === 'shipped')
        return event_types_1.EventType.RmaShipped;
    if (to === 'rejected')
        return event_types_1.EventType.RmaRejected;
    if (to === 'closed')
        return event_types_1.EventType.RmaClosed;
    if (rma_state_1.RMA_RESOLUTIONS.includes(to))
        return event_types_1.EventType.RmaResolved;
    return `rma.${to}`;
}
//# sourceMappingURL=supplier-rma.service.js.map