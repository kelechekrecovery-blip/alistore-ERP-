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
exports.UnitsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
const inventory_valuation_1 = require("../inventory/inventory-valuation");
let UnitsService = class UnitsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    listAvailable(productId, limit) {
        return this.prisma.deviceUnit.findMany({
            where: { productId, status: 'in_stock' },
            take: limit,
            orderBy: { id: 'asc' },
        });
    }
    async getByImei(imei) {
        const unit = await this.prisma.deviceUnit.findUnique({
            where: { imei },
            include: { product: { select: { name: true, sku: true, price: true } } },
        });
        if (!unit) {
            throw new errors_1.ValidationError('unit_not_found', `IMEI ${imei} не найден`);
        }
        return {
            imei: unit.imei,
            productId: unit.productId,
            status: unit.status,
            location: unit.location,
            orderId: unit.orderId,
            product: unit.product.name,
            sku: unit.product.sku,
            price: unit.product.price,
        };
    }
    async getForSaleByImei(imei) {
        const unit = await this.prisma.deviceUnit.findUnique({
            where: { imei },
            include: { product: { select: { name: true, sku: true, price: true, cost: true } } },
        });
        if (!unit)
            throw new errors_1.ValidationError('unit_not_found', `IMEI ${imei} не найден`);
        return {
            imei: unit.imei,
            productId: unit.productId,
            status: unit.status,
            location: unit.location,
            orderId: unit.orderId,
            product: unit.product.name,
            sku: unit.product.sku,
            price: unit.product.price,
            acquisitionCost: unit.acquisitionCost,
            productCost: unit.product.cost,
        };
    }
    async receive(input) {
        const product = await this.prisma.product.findUnique({
            where: { id: input.productId },
            select: { cost: true },
        });
        if (!product)
            throw new errors_1.ValidationError('product_not_found', `Товар ${input.productId} не найден`);
        return this.prisma.deviceUnit.create({
            data: {
                imei: input.imei,
                productId: input.productId,
                location: input.location,
                grade: input.grade,
                status: 'in_stock',
                acquisitionCost: product.cost,
            },
        });
    }
    async reserveOnTx(tx, imei, orderId) {
        const candidate = await tx.deviceUnit.findUnique({
            where: { imei },
            select: {
                acquisitionCost: true,
                product: { select: { cost: true } },
                consignmentItem: { select: { id: true } },
            },
        });
        const acquisitionCost = candidate?.consignmentItem
            ? candidate.acquisitionCost
            : candidate?.acquisitionCost ?? candidate?.product.cost;
        const { count } = await tx.deviceUnit.updateMany({
            where: { imei, status: 'in_stock' },
            data: { status: 'reserved', orderId, acquisitionCost },
        });
        if (count === 0) {
            const unit = await tx.deviceUnit.findUnique({ where: { imei } });
            if (!unit) {
                throw new errors_1.ValidationError('unit_not_found', `IMEI ${imei} не найден`);
            }
            throw new errors_1.ConflictError('unit_not_available', `IMEI ${imei} недоступен для резерва (статус: ${unit.status})`);
        }
    }
    async sellOnTx(tx, imei, orderId, actor = 'system') {
        const { count } = await tx.deviceUnit.updateMany({
            where: { imei, status: 'reserved', orderId },
            data: { status: 'sold' },
        });
        if (count === 0) {
            const unit = await tx.deviceUnit.findUnique({ where: { imei } });
            if (!unit) {
                throw new errors_1.ValidationError('unit_not_found', `IMEI ${imei} не найден`);
            }
            if (unit.status === 'sold') {
                throw new errors_1.ConflictError('unit_already_sold', `IMEI ${imei} уже продан`);
            }
            throw new errors_1.ConflictError('unit_not_reserved_for_order', `IMEI ${imei} не зарезервирован под заказ ${orderId}`);
        }
        const sold = await tx.deviceUnit.findUniqueOrThrow({
            where: { imei },
            include: {
                consignmentItem: { select: { id: true } },
            },
        });
        if (sold.consignmentItem)
            return null;
        if (sold.acquisitionCost === null) {
            throw new errors_1.ConflictError('unit_acquisition_cost_missing', `Для IMEI ${imei} не зафиксирована себестоимость`);
        }
        return (0, inventory_valuation_1.postCogsOnTx)(tx, {
            productId: sold.productId,
            orderId,
            sourceRef: `${orderId}:${imei}`,
            imei,
            location: sold.location,
            quantity: 1,
            unitCost: sold.acquisitionCost,
            actor,
        });
    }
    async releaseOnTx(tx, imei, orderId) {
        const { count } = await tx.deviceUnit.updateMany({
            where: { imei, status: 'reserved', orderId },
            data: { status: 'in_stock', orderId: null },
        });
        return count > 0;
    }
};
exports.UnitsService = UnitsService;
exports.UnitsService = UnitsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UnitsService);
//# sourceMappingURL=units.service.js.map