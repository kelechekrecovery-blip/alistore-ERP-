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
exports.ServiceCenterService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const outbox_service_1 = require("../outbox/outbox.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
const prisma_service_1 = require("../prisma/prisma.service");
const warranty_state_1 = require("../warranty/warranty-state");
const service_command_1 = require("./service-command");
const accounting_journal_1 = require("../finance/accounting-journal");
const sales_tax_1 = require("../finance/sales-tax");
const ACTIVE_SERVICE_STATUSES = ['created', 'received', 'diagnostics', 'waiting_supplier', 'approved', 'repairing', 'repaired', 'replaced'];
const PAID_REPAIR_SLA_MS = 3 * 24 * 60 * 60 * 1000;
const SERVICE_PAYMENT_METHODS = new Set(['cash', 'card', 'qr_mbank', 'qr_odengi', 'bakai_pos', 'obank']);
let ServiceCenterService = class ServiceCenterService {
    constructor(prisma, audit, outbox) {
        this.prisma = prisma;
        this.audit = audit;
        this.outbox = outbox;
    }
    async queue(actor) {
        const staff = await this.prisma.staffUser.findUnique({
            where: { id: actor },
            select: { active: true, role: true, point: true },
        });
        if (!staff?.active)
            throw new errors_1.ValidationError('service_queue_staff_inactive', 'Сотрудник не найден или отключён');
        const localImeis = staff.role === 'service'
            ? (await this.prisma.deviceUnit.findMany({ where: { location: staff.point }, select: { imei: true } })).map((unit) => unit.imei)
            : [];
        const scope = staff.role === 'technician'
            ? { workOrder: { technicianId: actor, point: staff.point } }
            : staff.role === 'service'
                ? {
                    OR: [
                        { workOrder: { point: staff.point } },
                        { workOrder: null, imei: { in: localImeis } },
                    ],
                }
                : {};
        const cases = await this.prisma.warrantyCase.findMany({
            where: scope,
            include: {
                workOrder: {
                    include: {
                        payments: { orderBy: { createdAt: 'asc' } },
                        parts: {
                            include: { product: { select: { id: true, sku: true, name: true, cost: true } } },
                            orderBy: { reservedAt: 'asc' },
                        },
                    },
                },
            },
            orderBy: { sla: 'asc' },
            take: 100,
        });
        const units = await this.prisma.deviceUnit.findMany({
            where: { imei: { in: cases.map((item) => item.imei) } },
            include: { product: { select: { name: true } } },
        });
        const unitByImei = new Map(units.map((unit) => [unit.imei, unit]));
        const customers = await this.prisma.customer.findMany({
            where: { id: { in: cases.map((item) => item.customerId) } },
            select: { id: true, name: true, phone: true },
        });
        const customerById = new Map(customers.map((customer) => [customer.id, customer]));
        const now = Date.now();
        return cases.map((warrantyCase) => {
            const terminal = ['closed', 'repaired', 'replaced', 'rejected'].includes(warrantyCase.status);
            const completedAt = warrantyCase.workOrder?.repairCompletedAt?.getTime();
            const remainingMs = warrantyCase.sla.getTime() - now;
            const slaState = completedAt
                ? (completedAt <= warrantyCase.sla.getTime() ? 'met' : 'missed')
                : terminal
                    ? 'closed'
                    : remainingMs < 0
                        ? 'overdue'
                        : remainingMs <= 6 * 60 * 60 * 1000 ? 'warning' : 'on_track';
            return {
                ...warrantyCase,
                slaState,
                productName: warrantyCase.deviceName ?? unitByImei.get(warrantyCase.imei)?.product.name ?? 'Устройство',
                customer: customerById.get(warrantyCase.customerId) ?? null,
            };
        });
    }
    mine(customerId) {
        return this.prisma.serviceWorkOrder.findMany({
            where: { warrantyCase: { customerId } },
            include: {
                warrantyCase: true,
                payments: { orderBy: { createdAt: 'asc' } },
                parts: {
                    include: { product: { select: { id: true, sku: true, name: true } } },
                    orderBy: { reservedAt: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async paymentContext(id, actor) {
        const workOrder = await this.prisma.serviceWorkOrder.findUnique({
            where: { id },
            include: {
                warrantyCase: true,
                payments: { orderBy: { createdAt: 'asc' } },
            },
        });
        if (!workOrder)
            throw new errors_1.ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
        if (workOrder.warrantyCase.serviceType !== 'paid') {
            throw new errors_1.ConflictError('service_payment_not_required', 'Гарантийный ремонт не оплачивается на кассе');
        }
        const shift = await this.prisma.cashShift.findFirst({ where: { staffId: actor, closedAt: null } });
        if (!shift)
            throw new errors_1.ConflictError('cash_shift_not_open', 'Сначала откройте кассовую смену');
        if (shift.point !== workOrder.point)
            throw new errors_1.ConflictError('service_payment_wrong_point', 'Ремонт относится к другой точке');
        const customer = await this.prisma.customer.findUnique({
            where: { id: workOrder.warrantyCase.customerId },
            select: { id: true, name: true, phone: true },
        });
        const paidTotal = workOrder.payments.reduce((sum, payment) => sum + payment.amount, 0);
        return {
            id: workOrder.id,
            warrantyCaseId: workOrder.warrantyCaseId,
            diagnosticSummary: workOrder.diagnosticSummary,
            estimateAmount: workOrder.estimateAmount,
            estimateApprovedAt: workOrder.estimateApprovedAt,
            point: workOrder.point,
            warrantyCase: {
                id: workOrder.warrantyCase.id,
                imei: workOrder.warrantyCase.imei,
                customerId: workOrder.warrantyCase.customerId,
                status: workOrder.warrantyCase.status,
                serviceType: workOrder.warrantyCase.serviceType,
                deviceName: workOrder.warrantyCase.deviceName,
            },
            customer,
            paidTotal,
        };
    }
    async pay(id, dto, actor, rawKey) {
        const key = (0, service_command_1.requiredServiceKey)(rawKey);
        const payments = dto.payments.map((payment) => ({ method: payment.method, amount: payment.amount }));
        const request = { workOrderId: id, payments };
        const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (existing)
            return (0, service_command_1.replayServiceCommand)(existing, 'pay', request);
        if (payments.some((payment) => !SERVICE_PAYMENT_METHODS.has(payment.method))) {
            throw new errors_1.ValidationError('service_payment_method_unsupported', 'Этот способ оплаты недоступен для ремонта');
        }
        try {
            return await this.audit.transaction(async (tx) => {
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'service-payment:' + id}))::text AS locked`;
                const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (raced)
                    return { result: (0, service_command_1.replayServiceCommand)(raced, 'pay', request), events: [] };
                const workOrder = await tx.serviceWorkOrder.findUnique({ where: { id }, include: { warrantyCase: true } });
                if (!workOrder)
                    throw new errors_1.ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
                if (workOrder.warrantyCase.serviceType !== 'paid') {
                    throw new errors_1.ConflictError('service_payment_not_required', 'Гарантийный ремонт не оплачивается на кассе');
                }
                if (!workOrder.estimateApprovedAt || workOrder.warrantyCase.status !== 'approved' || !workOrder.estimateAmount || workOrder.estimateAmount < 1) {
                    throw new errors_1.ConflictError('service_estimate_not_payable', 'Сначала клиент должен подтвердить ненулевую смету');
                }
                const existingPaid = await tx.payment.aggregate({
                    where: { serviceWorkOrderId: id },
                    _sum: { amount: true },
                });
                if ((existingPaid._sum.amount ?? 0) > 0) {
                    throw new errors_1.ConflictError('service_payment_already_completed', 'Ремонт уже оплачен');
                }
                const paidTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
                if (paidTotal !== workOrder.estimateAmount) {
                    throw new errors_1.ValidationError('service_payment_total_mismatch', 'Сумма оплат должна точно совпадать со сметой');
                }
                const shift = await tx.cashShift.findFirst({ where: { staffId: actor, closedAt: null } });
                if (!shift)
                    throw new errors_1.ConflictError('cash_shift_not_open', 'Сначала откройте кассовую смену');
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'shift-close:' + shift.id}))::text AS locked`;
                await tx.$queryRaw `SELECT id FROM "CashShift" WHERE id = ${shift.id} FOR UPDATE`;
                const activeShift = await tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } });
                if (activeShift.closedAt)
                    throw new errors_1.ConflictError('cash_shift_closed', 'Кассовая смена уже закрыта');
                if (activeShift.point !== workOrder.point)
                    throw new errors_1.ConflictError('service_payment_wrong_point', 'Ремонт относится к другой точке');
                const createdPayments = [];
                const accountingEntries = [];
                const taxMetadata = (0, sales_tax_1.outputTaxMetadata)([workOrder]);
                let processedAmount = 0;
                for (const [index, payment] of payments.entries()) {
                    const createdPayment = await tx.payment.create({
                        data: {
                            serviceWorkOrderId: id,
                            amount: payment.amount,
                            method: payment.method,
                            status: 'received',
                            shiftId: shift.id,
                            txnId: `service:${key}:${index}`,
                            accountCode: (0, accounting_journal_1.paymentAccountCode)(payment.method),
                            idempotencyKey: `service:${key}:${index}`,
                            receivedBy: actor,
                            point: workOrder.point,
                        },
                    });
                    const accountingEntry = await (0, accounting_journal_1.postPaymentEntryOnTx)(tx, {
                        payment: createdPayment,
                        idempotencyKey: `service:${key}:${index}`,
                        point: workOrder.point,
                        actor,
                        tax: {
                            ...taxMetadata,
                            taxAmount: (0, sales_tax_1.cumulativeTaxDelta)(workOrder.taxAmount, workOrder.estimateAmount, processedAmount, payment.amount),
                        },
                    });
                    processedAmount += payment.amount;
                    createdPayments.push(await tx.payment.findUniqueOrThrow({ where: { id: createdPayment.id } }));
                    accountingEntries.push(accountingEntry);
                }
                const updated = await tx.serviceWorkOrder.findUniqueOrThrow({
                    where: { id },
                    include: { warrantyCase: true, payments: { orderBy: { createdAt: 'asc' } } },
                });
                const result = { ...updated, paidTotal, shiftId: shift.id };
                await tx.serviceWorkOrderCommand.create({
                    data: { idempotencyKey: key, workOrderId: id, action: 'pay', request: (0, service_command_1.serviceJson)(request), response: (0, service_command_1.serviceJson)(result) },
                });
                return {
                    result,
                    events: [
                        ...createdPayments.map((payment) => ({
                            type: event_types_1.EventType.PaymentReceived,
                            actor,
                            payload: { paymentId: payment.id, serviceWorkOrderId: id, shiftId: shift.id, amount: payment.amount, method: payment.method },
                            refs: [payment.id, id, workOrder.warrantyCaseId, shift.id, workOrder.warrantyCase.customerId],
                        })),
                        ...accountingEntries.map((entry) => ({
                            type: event_types_1.EventType.AccountingEntryPosted,
                            actor,
                            payload: { accountingEntryId: entry.id, sourceType: 'payment.receipt', sourceRef: entry.sourceRef },
                            refs: [entry.id, entry.sourceRef, id, workOrder.warrantyCaseId],
                        })),
                        {
                            type: event_types_1.EventType.ServicePaymentCompleted,
                            actor,
                            payload: { workOrderId: id, serviceCaseId: workOrder.warrantyCaseId, shiftId: shift.id, paidTotal },
                            refs: [id, workOrder.warrantyCaseId, shift.id, workOrder.warrantyCase.customerId],
                        },
                    ],
                };
            });
        }
        catch (error) {
            if ((0, service_command_1.isServiceCommandUniqueViolation)(error)) {
                const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (command)
                    return (0, service_command_1.replayServiceCommand)(command, 'pay', request);
            }
            throw error;
        }
    }
    async create(dto, actor, rawKey) {
        const key = (0, service_command_1.requiredServiceKey)(rawKey);
        const request = {
            warrantyCaseId: dto.warrantyCaseId,
            technicianId: dto.technicianId?.trim() || null,
        };
        const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (existing)
            return (0, service_command_1.replayServiceCommand)(existing, 'create', request);
        try {
            return await this.audit.transaction(async (tx) => {
                const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (raced)
                    return { result: (0, service_command_1.replayServiceCommand)(raced, 'create', request), events: [] };
                const warrantyCase = await tx.warrantyCase.findUnique({
                    where: { id: dto.warrantyCaseId },
                    include: { workOrder: true },
                });
                if (!warrantyCase)
                    throw new errors_1.ValidationError('warranty_not_found', 'Гарантийное обращение не найдено');
                if (warrantyCase.workOrder)
                    throw new errors_1.ConflictError('service_work_order_exists', 'Заказ-наряд уже создан');
                if (!['created', 'received'].includes(warrantyCase.status)) {
                    throw new errors_1.ConflictError('service_intake_closed', 'Приём доступен только для нового обращения');
                }
                const point = await resolveStaffPoint(tx, actor);
                await assertActiveTechnician(tx, dto.technicianId, point);
                const workOrder = await tx.serviceWorkOrder.create({
                    data: {
                        warrantyCaseId: warrantyCase.id,
                        technicianId: dto.technicianId?.trim() || null,
                        createdBy: actor,
                        point,
                    },
                });
                if (warrantyCase.status === 'created') {
                    (0, warranty_state_1.assertWarrantyTransition)(warrantyCase.status, 'received');
                    await tx.warrantyCase.update({ where: { id: warrantyCase.id }, data: { status: 'received' } });
                }
                const result = await tx.serviceWorkOrder.findUniqueOrThrow({
                    where: { id: workOrder.id },
                    include: { warrantyCase: true, payments: true },
                });
                await tx.serviceWorkOrderCommand.create({
                    data: { idempotencyKey: key, workOrderId: workOrder.id, action: 'create', request, response: (0, service_command_1.serviceJson)(result) },
                });
                return {
                    result,
                    events: [
                        ...(warrantyCase.status === 'created' ? [{
                                type: 'warranty.received', actor,
                                payload: { warrantyId: warrantyCase.id, from: 'created', to: 'received' },
                                refs: [warrantyCase.id, warrantyCase.imei],
                            }] : []),
                        {
                            type: event_types_1.EventType.ServiceWorkOrderCreated, actor,
                            payload: { workOrderId: workOrder.id, warrantyId: warrantyCase.id, technicianId: workOrder.technicianId },
                            refs: [workOrder.id, warrantyCase.id, warrantyCase.imei],
                        },
                    ],
                };
            });
        }
        catch (error) {
            if ((0, service_command_1.isServiceCommandUniqueViolation)(error)) {
                const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (command)
                    return (0, service_command_1.replayServiceCommand)(command, 'create', request);
            }
            throw error;
        }
    }
    async createPaidRepair(dto, actor, rawKey) {
        const key = (0, service_command_1.requiredServiceKey)(rawKey);
        const request = {
            phone: dto.phone.trim(),
            customerName: dto.customerName.trim(),
            deviceName: dto.deviceName.trim(),
            serial: dto.serial.trim().toUpperCase(),
            problem: dto.problem.trim(),
            technicianId: dto.technicianId?.trim() || null,
        };
        const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (existing)
            return (0, service_command_1.replayServiceCommand)(existing, 'create_paid', request);
        try {
            return await this.audit.transaction(async (tx) => {
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'service-paid:' + request.serial}))::text AS locked`;
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'service-customer:' + request.phone}))::text AS locked`;
                const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (raced)
                    return { result: (0, service_command_1.replayServiceCommand)(raced, 'create_paid', request), events: [] };
                const active = await tx.warrantyCase.findFirst({
                    where: { imei: request.serial, serviceType: 'paid', status: { in: ACTIVE_SERVICE_STATUSES } },
                });
                if (active)
                    throw new errors_1.ConflictError('paid_repair_already_open', 'По устройству уже открыт платный ремонт');
                const point = await resolveStaffPoint(tx, actor);
                await assertActiveTechnician(tx, dto.technicianId, point);
                let customer = await tx.customer.findUnique({ where: { phone: request.phone } });
                if (!customer) {
                    customer = await tx.customer.create({ data: { phone: request.phone, name: request.customerName } });
                }
                else if (!customer.name.trim()) {
                    customer = await tx.customer.update({ where: { id: customer.id }, data: { name: request.customerName } });
                }
                const warrantyCase = await tx.warrantyCase.create({
                    data: {
                        imei: request.serial,
                        customerId: customer.id,
                        problem: request.problem,
                        status: 'received',
                        serviceType: 'paid',
                        deviceName: request.deviceName,
                        sla: new Date(Date.now() + PAID_REPAIR_SLA_MS),
                        assignee: dto.technicianId?.trim() || null,
                    },
                });
                const workOrder = await tx.serviceWorkOrder.create({
                    data: {
                        warrantyCaseId: warrantyCase.id,
                        technicianId: dto.technicianId?.trim() || null,
                        createdBy: actor,
                        point,
                    },
                });
                const result = await tx.serviceWorkOrder.findUniqueOrThrow({
                    where: { id: workOrder.id },
                    include: { warrantyCase: true, payments: true },
                });
                await tx.serviceWorkOrderCommand.create({
                    data: { idempotencyKey: key, workOrderId: workOrder.id, action: 'create_paid', request, response: (0, service_command_1.serviceJson)(result) },
                });
                return {
                    result,
                    events: [
                        {
                            type: event_types_1.EventType.ServicePaidRepairReceived,
                            actor,
                            payload: {
                                workOrderId: workOrder.id,
                                serviceCaseId: warrantyCase.id,
                                customerId: customer.id,
                                deviceName: warrantyCase.deviceName,
                                serial: warrantyCase.imei,
                                technicianId: workOrder.technicianId,
                            },
                            refs: [workOrder.id, warrantyCase.id, customer.id, warrantyCase.imei],
                        },
                        {
                            type: event_types_1.EventType.ServiceWorkOrderCreated,
                            actor,
                            payload: { workOrderId: workOrder.id, warrantyId: warrantyCase.id, serviceType: 'paid' },
                            refs: [workOrder.id, warrantyCase.id, customer.id, warrantyCase.imei],
                        },
                    ],
                };
            });
        }
        catch (error) {
            if ((0, service_command_1.isServiceCommandUniqueViolation)(error)) {
                const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (command)
                    return (0, service_command_1.replayServiceCommand)(command, 'create_paid', request);
            }
            throw error;
        }
    }
    async diagnose(id, dto, actor, rawKey) {
        const key = (0, service_command_1.requiredServiceKey)(rawKey);
        if (dto.diagnosticFee !== undefined && dto.diagnosticFee > dto.estimateAmount) {
            throw new errors_1.ValidationError('invalid_service_estimate', 'Диагностика не может быть дороже полной сметы');
        }
        const request = {
            workOrderId: id,
            summary: dto.summary.trim(),
            estimateAmount: dto.estimateAmount,
            diagnosticFee: dto.diagnosticFee ?? 0,
        };
        const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (existing)
            return (0, service_command_1.replayServiceCommand)(existing, 'diagnose', request);
        try {
            return await this.audit.transaction(async (tx) => {
                await lockServiceWorkOrder(tx, id);
                const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (raced)
                    return { result: (0, service_command_1.replayServiceCommand)(raced, 'diagnose', request), events: [] };
                const workOrder = await tx.serviceWorkOrder.findUnique({ where: { id }, include: { warrantyCase: true } });
                if (!workOrder)
                    throw new errors_1.ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
                await assertDiagnosisActor(tx, actor, workOrder.technicianId, workOrder.point);
                if (!['received', 'diagnostics'].includes(workOrder.warrantyCase.status)) {
                    throw new errors_1.ConflictError('service_diagnostics_closed', 'Диагностика недоступна в текущем статусе');
                }
                const moved = workOrder.warrantyCase.status === 'received';
                const taxAmount = (0, sales_tax_1.includedTax)(dto.estimateAmount, workOrder.taxRateBps);
                if (moved) {
                    (0, warranty_state_1.assertWarrantyTransition)(workOrder.warrantyCase.status, 'diagnostics');
                    await tx.warrantyCase.update({ where: { id: workOrder.warrantyCaseId }, data: { status: 'diagnostics' } });
                }
                const updated = await tx.serviceWorkOrder.update({
                    where: { id },
                    data: {
                        diagnosticSummary: dto.summary.trim(),
                        diagnosticFee: dto.diagnosticFee ?? 0,
                        estimateAmount: dto.estimateAmount,
                        taxBaseAmount: dto.estimateAmount - taxAmount,
                        taxAmount,
                        estimatePreparedAt: new Date(),
                        estimateApprovedAt: null,
                        estimateApprovedBy: null,
                    },
                    include: { warrantyCase: true, payments: true },
                });
                await tx.serviceWorkOrderCommand.create({
                    data: { idempotencyKey: key, workOrderId: id, action: 'diagnose', request, response: (0, service_command_1.serviceJson)(updated) },
                });
                if (this.outbox) {
                    await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                        customerId: workOrder.warrantyCase.customerId,
                        template: 'service_estimate_ready',
                        payload: { workOrderId: id, warrantyId: workOrder.warrantyCaseId, imei: workOrder.warrantyCase.imei, estimateAmount: dto.estimateAmount },
                        transactional: true,
                    });
                }
                return {
                    result: updated,
                    events: [
                        ...(moved && workOrder.warrantyCase.serviceType === 'warranty' ? [{
                                type: 'warranty.diagnostics', actor,
                                payload: { warrantyId: workOrder.warrantyCaseId, from: 'received', to: 'diagnostics' },
                                refs: [workOrder.warrantyCaseId, workOrder.warrantyCase.imei],
                            }] : []),
                        {
                            type: event_types_1.EventType.ServiceDiagnosticsCompleted, actor,
                            payload: { workOrderId: id, serviceType: workOrder.warrantyCase.serviceType, estimateAmount: dto.estimateAmount, diagnosticFee: dto.diagnosticFee ?? 0 },
                            refs: [id, workOrder.warrantyCaseId, workOrder.warrantyCase.imei],
                        },
                    ],
                };
            });
        }
        catch (error) {
            if ((0, service_command_1.isServiceCommandUniqueViolation)(error)) {
                const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (command)
                    return (0, service_command_1.replayServiceCommand)(command, 'diagnose', request);
            }
            throw error;
        }
    }
    async approveEstimate(id, customerId, rawKey) {
        const key = (0, service_command_1.requiredServiceKey)(rawKey);
        const request = { workOrderId: id, customerId };
        const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (existing)
            return (0, service_command_1.replayServiceCommand)(existing, 'approve_estimate', request);
        try {
            return await this.audit.transaction(async (tx) => {
                await lockServiceWorkOrder(tx, id);
                const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (raced)
                    return { result: (0, service_command_1.replayServiceCommand)(raced, 'approve_estimate', request), events: [] };
                const workOrder = await tx.serviceWorkOrder.findUnique({ where: { id }, include: { warrantyCase: true } });
                if (!workOrder)
                    throw new errors_1.ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
                if (workOrder.warrantyCase.customerId !== customerId) {
                    throw new errors_1.ValidationError('service_work_order_not_owned', 'Заказ-наряд принадлежит другому клиенту');
                }
                if (!workOrder.estimatePreparedAt || workOrder.estimateAmount === null) {
                    throw new errors_1.ConflictError('service_estimate_missing', 'Смета ещё не подготовлена');
                }
                if (workOrder.warrantyCase.status !== 'diagnostics') {
                    throw new errors_1.ConflictError('service_estimate_closed', 'Смету нельзя подтвердить в текущем статусе');
                }
                (0, warranty_state_1.assertWarrantyTransition)(workOrder.warrantyCase.status, 'approved');
                await tx.warrantyCase.update({ where: { id: workOrder.warrantyCaseId }, data: { status: 'approved' } });
                const approvedAt = new Date();
                const updated = await tx.serviceWorkOrder.update({
                    where: { id },
                    data: { estimateApprovedAt: approvedAt, estimateApprovedBy: customerId },
                    include: { warrantyCase: true, payments: true },
                });
                await tx.serviceWorkOrderCommand.create({
                    data: { idempotencyKey: key, workOrderId: id, action: 'approve_estimate', request, response: (0, service_command_1.serviceJson)(updated) },
                });
                return {
                    result: updated,
                    events: [
                        {
                            type: event_types_1.EventType.ServiceEstimateApproved, actor: customerId,
                            payload: { workOrderId: id, warrantyId: workOrder.warrantyCaseId, serviceType: workOrder.warrantyCase.serviceType, estimateAmount: workOrder.estimateAmount },
                            refs: [id, workOrder.warrantyCaseId, workOrder.warrantyCase.imei],
                        },
                        ...(workOrder.warrantyCase.serviceType === 'warranty' ? [{
                                type: 'warranty.approved', actor: customerId,
                                payload: { warrantyId: workOrder.warrantyCaseId, from: 'diagnostics', to: 'approved', source: 'customer_estimate' },
                                refs: [workOrder.warrantyCaseId, workOrder.warrantyCase.imei],
                            }] : []),
                    ],
                };
            });
        }
        catch (error) {
            if ((0, service_command_1.isServiceCommandUniqueViolation)(error)) {
                const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (command)
                    return (0, service_command_1.replayServiceCommand)(command, 'approve_estimate', request);
            }
            throw error;
        }
    }
    async assign(id, dto, actor, rawKey) {
        const key = (0, service_command_1.requiredServiceKey)(rawKey);
        const request = { workOrderId: id, technicianId: dto.technicianId.trim() };
        const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (existing)
            return (0, service_command_1.replayServiceCommand)(existing, 'assign_technician', request);
        try {
            return await this.audit.transaction(async (tx) => {
                await lockServiceWorkOrder(tx, id);
                const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (raced)
                    return { result: (0, service_command_1.replayServiceCommand)(raced, 'assign_technician', request), events: [] };
                const workOrder = await tx.serviceWorkOrder.findUnique({ where: { id }, include: { warrantyCase: true } });
                if (!workOrder)
                    throw new errors_1.ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
                await assertAssignmentActor(tx, actor, workOrder.point);
                if (['repairing', 'repaired', 'replaced', 'closed', 'rejected'].includes(workOrder.warrantyCase.status)) {
                    throw new errors_1.ConflictError('service_assignment_closed', 'Мастера нельзя менять после начала или закрытия ремонта');
                }
                await assertActiveTechnician(tx, dto.technicianId, workOrder.point, true);
                const updated = await tx.serviceWorkOrder.update({
                    where: { id },
                    data: { technicianId: dto.technicianId.trim(), warrantyCase: { update: { assignee: dto.technicianId.trim() } } },
                    include: { warrantyCase: true, payments: true, parts: { include: { product: true }, orderBy: { reservedAt: 'asc' } } },
                });
                await tx.serviceWorkOrderCommand.create({
                    data: { idempotencyKey: key, workOrderId: id, action: 'assign_technician', request, response: (0, service_command_1.serviceJson)(updated) },
                });
                return {
                    result: updated,
                    events: [{
                            type: event_types_1.EventType.ServiceTechnicianAssigned,
                            actor,
                            payload: { workOrderId: id, from: workOrder.technicianId, to: updated.technicianId, point: workOrder.point },
                            refs: [id, workOrder.warrantyCaseId, updated.technicianId],
                        }],
                };
            });
        }
        catch (error) {
            if ((0, service_command_1.isServiceCommandUniqueViolation)(error)) {
                const command = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (command)
                    return (0, service_command_1.replayServiceCommand)(command, 'assign_technician', request);
            }
            throw error;
        }
    }
};
exports.ServiceCenterService = ServiceCenterService;
exports.ServiceCenterService = ServiceCenterService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        outbox_service_1.OutboxService])
], ServiceCenterService);
async function assertActiveTechnician(tx, technicianId, point, required = false) {
    const id = technicianId?.trim();
    if (!id) {
        if (required)
            throw new errors_1.ValidationError('service_technician_required', 'Выберите мастера');
        return;
    }
    const technician = await tx.staffUser.findUnique({ where: { id }, select: { active: true, role: true, point: true } });
    if (!technician?.active || !['service', 'technician', 'admin', 'owner'].includes(technician.role) || technician.point !== point) {
        throw new errors_1.ValidationError('service_technician_ineligible', 'Мастер неактивен, не имеет сервисной роли или относится к другой точке');
    }
}
async function resolveStaffPoint(tx, actor) {
    const activeShift = await tx.cashShift.findFirst({
        where: { staffId: actor, closedAt: null },
        orderBy: { openedAt: 'desc' },
        select: { point: true },
    });
    if (activeShift)
        return activeShift.point;
    const staff = await tx.staffUser.findUnique({ where: { id: actor }, select: { active: true, point: true } });
    if (!staff?.active)
        throw new errors_1.ValidationError('service_intake_staff_inactive', 'Сотрудник не найден или отключён');
    return staff.point;
}
async function assertDiagnosisActor(tx, actor, technicianId, point) {
    const staff = await tx.staffUser.findUnique({ where: { id: actor }, select: { active: true, role: true, point: true } });
    if (!staff?.active)
        throw new errors_1.ValidationError('service_diagnosis_staff_inactive', 'Сотрудник не найден или отключён');
    if (staff.role === 'admin' || staff.role === 'owner')
        return;
    const allowed = staff.point === point && (staff.role === 'service' || (staff.role === 'technician' && actor === technicianId));
    if (!allowed)
        throw new errors_1.ConflictError('service_diagnosis_forbidden', 'Диагностика доступна назначенному мастеру этой точки');
}
async function assertAssignmentActor(tx, actor, point) {
    const staff = await tx.staffUser.findUnique({ where: { id: actor }, select: { active: true, role: true, point: true } });
    if (!staff?.active)
        throw new errors_1.ValidationError('service_assignment_staff_inactive', 'Сотрудник не найден или отключён');
    if (staff.role === 'admin' || staff.role === 'owner')
        return;
    if (staff.role !== 'service' || staff.point !== point) {
        throw new errors_1.ConflictError('service_assignment_forbidden', 'Назначение мастера доступно сервис-менеджеру этой точки');
    }
}
async function lockServiceWorkOrder(tx, id) {
    const rows = await tx.$queryRaw `SELECT id FROM "ServiceWorkOrder" WHERE id = ${id} FOR UPDATE`;
    if (rows.length === 0)
        throw new errors_1.ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
}
//# sourceMappingURL=service-center.service.js.map