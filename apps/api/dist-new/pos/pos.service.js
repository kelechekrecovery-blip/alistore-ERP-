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
exports.PosService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const customers_service_1 = require("../customers/customers.service");
const shifts_service_1 = require("../shifts/shifts.service");
const units_service_1 = require("../units/units.service");
const orders_service_1 = require("../orders/orders.service");
const payments_service_1 = require("../payments/payments.service");
const approvals_service_1 = require("../approvals/approvals.service");
const prisma_service_1 = require("../prisma/prisma.service");
const settings_service_1 = require("../settings/settings.service");
const errors_1 = require("../common/errors");
const store_point_identity_1 = require("../common/store-point-identity");
const margin_control_1 = require("./margin-control");
const pos_customer_binding_1 = require("./pos-customer-binding");
const WALKIN_PHONE = '+000000000000';
const POS_AUTO_DEDUP_WINDOW_MS = 60_000;
let PosService = class PosService {
    constructor(prisma, customers, shifts, units, orders, payments, approvals, settings) {
        this.prisma = prisma;
        this.customers = customers;
        this.shifts = shifts;
        this.units = units;
        this.orders = orders;
        this.payments = payments;
        this.approvals = approvals;
        this.settings = settings;
    }
    async approvalThresholds() {
        const [discountPct, priceChangePct, minMarginSom] = await Promise.all([
            this.settings.value('discount.approval_threshold_pct'),
            this.settings.value('discount.price_change_threshold_pct'),
            this.settings.value('discount.min_margin_som'),
        ]);
        return { discountPct, priceChangePct, minMarginSom };
    }
    async findCustomer(rawPhone, staffId, point, clientSaleId) {
        const storePoint = await (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, point, 'Точка кассы недоступна или отключена');
        const staff = await this.prisma.staffUser.findUnique({
            where: { id: staffId },
            select: { point: true },
        });
        if (staff) {
            const assignedPoint = await (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, staff.point, 'Точка сотрудника недоступна или отключена');
            if (!assignedPoint || assignedPoint.id !== storePoint.id) {
                throw new errors_1.ForbiddenError('staff_point_mismatch', 'Кассир не назначен на выбранную точку');
            }
        }
        const phone = normalizeCustomerPhone(rawPhone);
        const alternatePhone = phone.startsWith('+') ? phone.slice(1) : `+${phone}`;
        const select = { id: true, name: true, phone: true };
        const customer = await this.prisma.customer.findUnique({
            where: { phone },
            select,
        }) ?? await this.prisma.customer.findUnique({
            where: { phone: alternatePhone },
            select,
        });
        await this.prisma.auditEvent.create({
            data: {
                type: 'pos.customer_lookup',
                actor: staffId,
                payload: { point: storePoint.inventoryLocation, found: Boolean(customer) },
                refs: customer ? [customer.id] : [],
            },
        });
        if (!customer)
            return null;
        const entries = await this.prisma.loyaltyEntry.findMany({
            where: {
                customerId: customer.id,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            select: { amount: true },
        });
        return {
            name: customer.name || 'Клиент AliStore',
            phone: maskPhone(customer.phone),
            loyaltyBalance: Math.max(0, entries.reduce((sum, entry) => sum + entry.amount, 0)),
            binding: (0, pos_customer_binding_1.issuePosCustomerBinding)(customer.id, staffId, storePoint.inventoryLocation, clientSaleId),
        };
    }
    async sale(dto) {
        const actor = dto.staffId;
        const storePoint = await (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, dto.point, 'Точка кассы недоступна или отключена');
        const explicitTxnId = dto.clientSaleId ? `pos:${dto.clientSaleId}` : undefined;
        const existingPayment = explicitTxnId
            ? await this.payments.findByTxnId(explicitTxnId)
            : null;
        const existingExplicitSale = Boolean(existingPayment?.orderId
            || (explicitTxnId && await this.prisma.order.findUnique({
                where: { idempotencyKey: explicitTxnId },
                select: { id: true },
            })));
        const boundCustomerId = dto.customerBinding
            ? (0, pos_customer_binding_1.requirePosCustomerBinding)(dto.customerBinding, actor, storePoint.inventoryLocation, dto.clientSaleId, {
                allowExpiredReplay: existingExplicitSale,
            }).sub
            : undefined;
        const staff = await this.prisma.staffUser.findUnique({
            where: { id: actor },
            select: { active: true, point: true },
        });
        if (staff) {
            if (!staff.active)
                throw new errors_1.ForbiddenError('staff_inactive', 'Учётная запись сотрудника отключена');
            const staffPoint = await (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, staff.point, 'Точка сотрудника недоступна или отключена');
            if (!staffPoint || staffPoint.id !== storePoint.id) {
                throw new errors_1.ForbiddenError('staff_point_mismatch', 'Кассир не назначен на выбранную точку');
            }
        }
        const pct = dto.discountPct ?? 0;
        const txnId = this.deriveTxnId(dto, boundCustomerId);
        if (txnId) {
            const existing = await this.payments.findByTxnId(txnId);
            if (existing?.orderId) {
                const expectedTotal = (0, margin_control_1.saleTotal)(dto.lines, pct);
                const expectedPayments = this.normalizePayments(dto, expectedTotal);
                return this.replaySale(existing, dto, boundCustomerId, storePoint.inventoryLocation, expectedTotal, expectedPayments);
            }
            const existingOrder = await this.prisma.order.findUnique({
                where: { idempotencyKey: txnId },
                select: { id: true, status: true, total: true, posShiftId: true },
            });
            if (existingOrder) {
                await this.assertReplayCompatible(existingOrder.id, dto, boundCustomerId);
                if (existingOrder.status === 'paid') {
                    const replay = await this.completedFromExistingPayment(existingOrder.id, existingOrder.posShiftId);
                    return dto.clientSaleId ? replay : { ...replay, dedupedBy: 'fingerprint' };
                }
                if (existingOrder.status === 'created' || existingOrder.status === 'reserved') {
                    return this.resumeSale(existingOrder, dto, txnId);
                }
                throw new errors_1.ConflictError('sale_key_burned', `Продажа по этому ключу уже ${existingOrder.status === 'cancelled' ? 'отменена' : `завершена (${existingOrder.status})`}; оформите заново с новым ключом`);
            }
        }
        const items = await this.resolveOrderLines(dto, storePoint.inventoryLocation);
        const margin = await this.evaluateMargin(items, pct);
        const total = margin.total;
        const payments = this.normalizePayments(dto, total);
        const { discountPct: discountThresholdPct } = await this.approvalThresholds();
        const discountApprovalNeeded = pct > discountThresholdPct;
        const marginApprovalNeeded = margin.breaches.length > 0;
        const approvalReason = this.approvalReason(discountApprovalNeeded, marginApprovalNeeded);
        if (discountApprovalNeeded || marginApprovalNeeded) {
            if (!dto.approvalId) {
                const parked = await this.approvals.request({
                    action: 'discount',
                    requester: actor,
                    reason: dto.reason ?? this.defaultApprovalMessage(approvalReason, pct, margin, discountThresholdPct),
                    payload: {
                        staffId: dto.staffId,
                        point: storePoint.inventoryLocation,
                        discountPct: pct,
                        gross: margin.gross,
                        total: margin.total,
                        lines: dto.lines.length,
                        approvalReason,
                        minMargin: margin.minMargin,
                        worstMargin: margin.worstMargin,
                        marginBreaches: margin.breaches,
                        marginFingerprint: margin.fingerprint,
                    },
                });
                return {
                    pendingApproval: true,
                    approvalId: parked.approvalId,
                    discountPct: pct,
                    reason: approvalReason,
                    margin: {
                        minMargin: margin.minMargin,
                        worstMargin: margin.worstMargin,
                        breaches: margin.breaches,
                    },
                };
            }
            await this.assertDiscountApproved(dto.approvalId, pct, margin.fingerprint, marginApprovalNeeded);
        }
        const customer = boundCustomerId
            ? await this.prisma.customer.findUnique({ where: { id: boundCustomerId } })
            : await this.customers.upsert({
                phone: WALKIN_PHONE,
                name: 'Розничный покупатель',
            });
        if (!customer) {
            throw new errors_1.ValidationError('pos_customer_not_found', 'Выбранный клиент не найден');
        }
        const shift = await this.shifts.currentOpen(dto.staffId);
        if (!shift) {
            throw new errors_1.ConflictError('cash_shift_required', 'Для продажи нужна открытая кассовая смена');
        }
        const orderItems = items.map(({ productId: _productId, unitCost: _unitCost, costRef: _costRef, ...item }) => item);
        const order = await this.orders.create({ customerId: customer.id, channel: 'pos', fulfillmentType: 'store', storePointId: storePoint.id, total, items: orderItems }, actor, txnId, {
            subtotal: total,
            deliveryFee: 0,
            promoCode: null,
            promoDiscount: 0,
            loyaltyPoints: 0,
            unitCostsByLine: items.map((item) => item.unitCost),
            posShiftId: shift.id,
        }, storePoint);
        const containsBundle = await this.prisma.product.count({
            where: { sku: { in: items.map((item) => item.sku) }, bundleComponents: { some: {} } },
        });
        if (containsBundle > 0) {
            try {
                await this.orders.fulfill(order.id, actor);
                const expectedBundleImeis = items.flatMap((item) => bundleImeis(item.costRef));
                const allocations = await this.prisma.orderBundleAllocation.findMany({
                    where: { orderId: order.id },
                    select: { imei: true },
                    orderBy: { imei: 'asc' },
                });
                const actualBundleImeis = allocations.map((allocation) => allocation.imei).sort();
                if (JSON.stringify(actualBundleImeis) !== JSON.stringify(expectedBundleImeis.sort())) {
                    throw new errors_1.ConflictError('bundle_inventory_changed', 'Состав набора изменился; повторите продажу и одобрение');
                }
            }
            catch (error) {
                const failedOrder = await this.prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
                if (failedOrder?.status === 'created' || failedOrder?.status === 'reserved') {
                    await this.orders.transition(order.id, 'cancelled', actor);
                }
                throw error;
            }
        }
        else
            await this.orders.fulfill(order.id, actor);
        if (total === 0) {
            return {
                pendingApproval: false,
                orderId: order.id,
                receiptNo: `POS-${order.id.slice(-6).toUpperCase()}`,
                total,
                status: 'paid',
                shiftId: shift.id,
                imeis: items.filter((item) => item.imei).map((item) => item.imei),
            };
        }
        const paid = await this.payments.payMany({
            orderId: order.id,
            shiftId: shift.id,
            payments: payments.map((payment, index) => ({
                ...payment,
                txnId: txnId ? (index === 0 ? txnId : `${txnId}:${index}`) : undefined,
            })),
        }, actor, { staffId: dto.staffId });
        return {
            pendingApproval: false,
            orderId: order.id,
            receiptNo: `POS-${order.id.slice(-6).toUpperCase()}`,
            total,
            status: paid.order?.status ?? 'paid',
            shiftId: shift.id,
            imeis: items.filter((i) => i.imei).map((i) => i.imei),
        };
    }
    deriveTxnId(dto, customerId) {
        if (dto.clientSaleId)
            return `pos:${dto.clientSaleId}`;
        return `pos:auto:${this.saleFingerprint(dto, customerId)}`;
    }
    saleFingerprint(dto, customerId) {
        const bucket = Math.floor(Date.now() / POS_AUTO_DEDUP_WINDOW_MS);
        const lines = dto.lines
            .map((line) => `${line.sku}:${line.qty}:${line.price}`)
            .sort()
            .join('|');
        const tenders = (dto.payments ?? (dto.method ? [{ method: dto.method, amount: 0 }] : []))
            .map((payment) => `${payment.method}:${payment.amount}`)
            .sort()
            .join('|');
        const material = [dto.staffId, dto.point, customerId ?? WALKIN_PHONE, dto.discountPct ?? 0, lines, tenders, bucket].join('#');
        return (0, crypto_1.createHash)('sha256').update(material).digest('hex').slice(0, 32);
    }
    async replaySale(existing, dto, customerId, point, total, payments) {
        const order = await this.orders.get(existing.orderId);
        if (!order) {
            throw new errors_1.ValidationError('order_not_found', `Заказ ${existing.orderId} не найден`);
        }
        const storedHash = this.saleRequestHash({
            staffId: existing.receivedBy ?? '',
            point: existing.point ?? '',
            customerId: order.customerId,
            total: order.total,
            lines: order.items,
            tenders: order.payments.filter((payment) => payment.amount > 0),
        });
        const requestHash = this.saleRequestHash({
            staffId: dto.staffId ?? '',
            point,
            customerId: customerId ?? (await this.prisma.customer.findUnique({
                where: { phone: WALKIN_PHONE },
                select: { id: true },
            }))?.id ?? WALKIN_PHONE,
            total,
            lines: dto.lines,
            tenders: payments,
        });
        if (storedHash !== requestHash) {
            throw new errors_1.ConflictError('idempotency_key_reused', 'Ключ уже использован с другим запросом');
        }
        const completed = await this.completedFromExistingPayment(order.id, existing.shiftId);
        return dto.clientSaleId ? completed : { ...completed, dedupedBy: 'fingerprint' };
    }
    saleRequestHash(composition) {
        const aggregated = new Map();
        for (const line of composition.lines) {
            const key = `${line.sku}:${line.price}`;
            const existing = aggregated.get(key);
            if (existing)
                existing.qty += line.qty;
            else
                aggregated.set(key, { sku: line.sku, qty: line.qty, price: line.price });
        }
        const canonical = {
            staffId: composition.staffId,
            point: composition.point,
            customerId: composition.customerId,
            total: composition.total,
            lines: [...aggregated.values()].map((line) => `${line.sku}:${line.qty}:${line.price}`).sort(),
            tenders: composition.tenders.map((tender) => `${tender.method}:${tender.amount}`).sort(),
        };
        return (0, crypto_1.createHash)('sha256').update(JSON.stringify(canonical)).digest('hex');
    }
    normalizePayments(dto, total) {
        if (dto.payments?.length) {
            const paymentTotal = dto.payments.reduce((sum, payment) => sum + payment.amount, 0);
            if (paymentTotal !== total) {
                throw new errors_1.ValidationError('payment_split_mismatch', `Сумма split-платежей ${paymentTotal} должна равняться итогу ${total}`);
            }
            return dto.payments.map((payment) => ({ method: payment.method, amount: payment.amount }));
        }
        if (!dto.method) {
            throw new errors_1.ValidationError('payment_method_required', 'Укажите способ оплаты или split-платежи');
        }
        return [{ method: dto.method, amount: total }];
    }
    async evaluateMargin(items, pct) {
        const { minMarginSom } = await this.approvalThresholds();
        return (0, margin_control_1.evaluateMarginControl)(items.map((item) => ({
            productId: item.productId,
            sku: item.sku,
            qty: item.qty,
            price: item.price,
            cost: item.unitCost,
            costRef: item.costRef ?? item.imei,
        })), pct, minMarginSom);
    }
    async resolveOrderLines(dto, location) {
        const items = [];
        for (const line of dto.lines) {
            if (line.imei) {
                if (line.qty !== 1)
                    throw new errors_1.ValidationError('serialized_quantity_invalid', 'Строка с IMEI должна иметь количество 1');
                const selected = await this.units.getForSaleByImei(line.imei);
                if (selected.productId !== line.productId || selected.sku !== line.sku) {
                    throw new errors_1.ValidationError('imei_product_mismatch', `IMEI ${line.imei} не относится к ${line.sku}`);
                }
                if (line.price !== selected.price) {
                    throw new errors_1.ValidationError('product_price_mismatch', `Цена ${line.sku} изменилась: актуальная цена ${selected.price}`);
                }
                if (selected.status !== 'in_stock')
                    throw new errors_1.ConflictError('unit_not_available', `IMEI ${line.imei} недоступен (статус: ${selected.status})`);
                if (selected.location !== location)
                    throw new errors_1.ConflictError('unit_wrong_location', `IMEI ${line.imei} находится в другой точке`);
                items.push({ productId: line.productId, sku: line.sku, qty: 1, price: line.price, imei: line.imei, unitCost: selected.acquisitionCost ?? selected.productCost });
                continue;
            }
            const product = await this.prisma.product.findUnique({
                where: { id: line.productId },
                include: {
                    _count: { select: { bundleComponents: true } },
                    bundleComponents: {
                        select: {
                            qty: true,
                            componentProductId: true,
                            componentProduct: { select: { sku: true, cost: true, trackingMode: true } },
                        },
                    },
                },
            });
            if (!product || product.sku !== line.sku)
                throw new errors_1.ValidationError('product_not_found', `Товар ${line.sku} не найден`);
            if (line.price !== product.price)
                throw new errors_1.ValidationError('product_price_mismatch', `Цена ${line.sku} изменилась: актуальная цена ${product.price}`);
            if (product.trackingMode === 'quantity' || product._count.bundleComponents > 0) {
                if (product.bundleComponents.length === 0) {
                    items.push({ productId: line.productId, sku: line.sku, qty: line.qty, price: line.price, unitCost: product.cost });
                    continue;
                }
                const bundleCopies = Array.from({ length: line.qty }, () => ({ unitCost: 0, imeis: [] }));
                for (const component of product.bundleComponents) {
                    if (component.componentProduct.trackingMode === 'quantity') {
                        for (const copy of bundleCopies)
                            copy.unitCost += component.qty * component.componentProduct.cost;
                        continue;
                    }
                    const required = component.qty * line.qty;
                    const units = await this.prisma.deviceUnit.findMany({
                        where: { productId: component.componentProductId, status: 'in_stock', location, consignmentItem: { is: null } },
                        take: required,
                        orderBy: { id: 'asc' },
                    });
                    if (units.length < required) {
                        throw new errors_1.ConflictError('insufficient_bundle_stock', `Для набора ${line.sku} недостаточно ${component.componentProduct.sku}: нужно ${required}, в наличии ${units.length}`);
                    }
                    for (const [copyIndex, copy] of bundleCopies.entries()) {
                        for (const unit of units.slice(copyIndex * component.qty, (copyIndex + 1) * component.qty)) {
                            copy.unitCost += unit.acquisitionCost ?? component.componentProduct.cost;
                            copy.imeis.push(unit.imei);
                        }
                    }
                }
                for (const copy of bundleCopies) {
                    items.push({
                        productId: line.productId,
                        sku: line.sku,
                        qty: 1,
                        price: line.price,
                        unitCost: copy.unitCost,
                        costRef: copy.imeis.length > 0 ? `bundle:${copy.imeis.sort().join(',')}` : undefined,
                    });
                }
                continue;
            }
            const available = await this.prisma.deviceUnit.findMany({
                where: { productId: line.productId, status: 'in_stock', location },
                take: line.qty,
                orderBy: { id: 'asc' },
            });
            if (available.length < line.qty) {
                throw new errors_1.ConflictError('insufficient_stock', `Недостаточно единиц ${line.sku}: нужно ${line.qty}, в наличии ${available.length}`);
            }
            for (const unit of available) {
                items.push({ productId: line.productId, sku: line.sku, qty: 1, price: line.price, imei: unit.imei, unitCost: unit.acquisitionCost ?? product.cost });
            }
        }
        return items;
    }
    async assertDiscountApproved(approvalId, pct, marginFingerprint, requiresMarginApproval) {
        const approval = await this.approvals.get(approvalId);
        if (!approval || approval.action !== 'discount') {
            throw new errors_1.ValidationError('discount_approval_not_found', 'Одобрение скидки не найдено');
        }
        if (approval.status !== 'approved') {
            throw new errors_1.ForbiddenError('discount_not_approved', `Скидка ещё не одобрена (${approval.status})`);
        }
        const payload = approval.evidence?.payload;
        const approvedPct = payload?.discountPct;
        if (approvedPct !== pct) {
            throw new errors_1.ForbiddenError('discount_mismatch', `Одобрено ${approvedPct}%, применяется ${pct}%`);
        }
        if (requiresMarginApproval && payload?.marginFingerprint !== marginFingerprint) {
            throw new errors_1.ForbiddenError('margin_mismatch', 'Одобрение маржи не совпадает с текущей продажей');
        }
        if (payload?.marginFingerprint && payload.marginFingerprint !== marginFingerprint) {
            throw new errors_1.ForbiddenError('discount_mismatch', 'Одобрение скидки не совпадает с текущей продажей');
        }
        const claimed = await this.prisma.approval.updateMany({
            where: { id: approvalId, action: 'discount', status: 'approved', consumedAt: null },
            data: { consumedAt: new Date() },
        });
        if (claimed.count === 0) {
            throw new errors_1.ForbiddenError('discount_approval_already_used', 'Это одобрение скидки уже использовано');
        }
    }
    approvalReason(discountApprovalNeeded, marginApprovalNeeded) {
        if (discountApprovalNeeded && marginApprovalNeeded)
            return 'discount_and_margin';
        if (marginApprovalNeeded)
            return 'margin';
        return 'discount';
    }
    defaultApprovalMessage(reason, pct, margin, discountThresholdPct) {
        if (reason === 'margin') {
            return `Маржа ${margin.worstMargin} сом ниже лимита ${margin.minMargin} сом в POS`;
        }
        if (reason === 'discount_and_margin') {
            return `Скидка ${pct}% и маржа ${margin.worstMargin} сом ниже лимита ${margin.minMargin} сом в POS`;
        }
        return `Скидка ${pct}% в POS (> лимита ${discountThresholdPct}%)`;
    }
    async completedFromExistingPayment(orderId, shiftId) {
        const order = await this.orders.get(orderId);
        if (!order) {
            throw new errors_1.ValidationError('order_not_found', `Заказ ${orderId} не найден`);
        }
        return {
            pendingApproval: false,
            orderId: order.id,
            receiptNo: `POS-${order.id.slice(-6).toUpperCase()}`,
            total: order.total,
            status: order.status,
            shiftId: shiftId ?? '',
            imeis: order.items.filter((i) => i.imei).map((i) => i.imei),
            idempotent: true,
        };
    }
    async resumeSale(existing, dto, txnId) {
        const order = await this.prisma.order.findUnique({
            where: { id: existing.id },
            select: { status: true },
        });
        if (order?.status === 'created') {
            await this.orders.fulfill(existing.id, dto.staffId);
        }
        else if (order?.status !== 'reserved') {
            throw new errors_1.ConflictError('sale_not_resumable', `Продажу в статусе ${order?.status ?? 'unknown'} нельзя дожать`);
        }
        if (existing.total === 0) {
            return this.completedFromExistingPayment(existing.id, existing.posShiftId);
        }
        const shift = await this.shifts.currentOpen(dto.staffId);
        if (!shift) {
            throw new errors_1.ConflictError('cash_shift_required', 'Для продажи нужна открытая кассовая смена');
        }
        const tenders = this.normalizePayments(dto, existing.total);
        const paid = await this.payments.payMany({
            orderId: existing.id,
            shiftId: shift.id,
            payments: tenders.map((payment, index) => ({
                ...payment,
                txnId: index === 0 ? txnId : `${txnId}:${index}`,
            })),
        }, dto.staffId, { staffId: dto.staffId });
        const completed = await this.orders.get(existing.id);
        if (!completed) {
            throw new errors_1.ValidationError('order_not_found', `Заказ ${existing.id} не найден`);
        }
        return {
            pendingApproval: false,
            orderId: completed.id,
            receiptNo: `POS-${completed.id.slice(-6).toUpperCase()}`,
            total: completed.total,
            status: paid.order?.status ?? completed.status,
            shiftId: shift.id,
            imeis: completed.items.filter((item) => item.imei).map((item) => item.imei),
            resumed: true,
        };
    }
    async assertReplayCompatible(orderId, dto, customerId) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: {
                customerId: true,
                total: true,
                items: { select: { sku: true, qty: true, price: true }, orderBy: { lineNumber: 'asc' } },
                posShift: { select: { staffId: true } },
            },
        });
        if (!order)
            throw new errors_1.ValidationError('order_not_found', `Заказ ${orderId} не найден`);
        const requestedCustomerId = customerId ?? (await this.prisma.customer.findUnique({
            where: { phone: WALKIN_PHONE },
            select: { id: true },
        }))?.id;
        if (!requestedCustomerId || order.customerId !== requestedCustomerId) {
            throw new errors_1.ConflictError('idempotency_key_reused', 'Ключ продажи уже связан с другим клиентом');
        }
        if (order.posShift?.staffId && order.posShift.staffId !== dto.staffId) {
            throw new errors_1.ConflictError('idempotency_key_reused', 'Ключ продажи уже принадлежит другому кассиру');
        }
        const aggregate = (lines) => {
            const bySkuPrice = new Map();
            for (const line of lines) {
                const key = `${line.sku}:${line.price}`;
                const seen = bySkuPrice.get(key);
                if (seen)
                    seen.qty += line.qty;
                else
                    bySkuPrice.set(key, { sku: line.sku, qty: line.qty, price: line.price });
            }
            return [...bySkuPrice.values()]
                .map((line) => `${line.sku}:${line.qty}:${line.price}`)
                .sort()
                .join('|');
        };
        if (aggregate(dto.lines) !== aggregate(order.items)) {
            throw new errors_1.ConflictError('idempotency_key_reused', 'Ключ продажи уже связан с другим составом корзины');
        }
        if ((0, margin_control_1.saleTotal)(dto.lines, dto.discountPct ?? 0) !== order.total) {
            throw new errors_1.ConflictError('idempotency_key_reused', 'Ключ продажи уже связан с другой суммой');
        }
    }
};
exports.PosService = PosService;
exports.PosService = PosService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        customers_service_1.CustomersService,
        shifts_service_1.ShiftsService,
        units_service_1.UnitsService,
        orders_service_1.OrdersService,
        payments_service_1.PaymentsService,
        approvals_service_1.ApprovalsService,
        settings_service_1.SettingsService])
], PosService);
function normalizeCustomerPhone(rawPhone) {
    const phone = rawPhone?.trim() ?? '';
    if (!/^\+?[0-9]{9,15}$/.test(phone)) {
        throw new errors_1.ValidationError('pos_customer_phone_invalid', 'Введите телефон клиента в международном формате');
    }
    return phone.startsWith('+') ? phone : `+${phone}`;
}
function maskPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 4)
        return '***';
    return `+${digits.slice(0, 3)}******${digits.slice(-2)}`;
}
function bundleImeis(costRef) {
    return costRef?.startsWith('bundle:') ? costRef.slice('bundle:'.length).split(',').filter(Boolean) : [];
}
//# sourceMappingURL=pos.service.js.map