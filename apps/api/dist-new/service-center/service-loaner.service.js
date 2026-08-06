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
exports.ServiceLoanerService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const outbox_service_1 = require("../outbox/outbox.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
const prisma_service_1 = require("../prisma/prisma.service");
const accounting_journal_1 = require("../finance/accounting-journal");
const cash_drawer_1 = require("../shifts/cash-drawer");
const service_command_1 = require("./service-command");
const ACTIVE_LOAN_STATUSES = ['prepared', 'issued', 'overdue'];
const MANAGER_ROLES = new Set(['admin', 'owner']);
const loanInclude = {
    device: { include: { unit: { include: { product: { select: { id: true, name: true, sku: true } } } } } },
    workOrder: { include: { warrantyCase: true } },
};
let ServiceLoanerService = class ServiceLoanerService {
    constructor(prisma, audit, outbox) {
        this.prisma = prisma;
        this.audit = audit;
        this.outbox = outbox;
    }
    async list(actor) {
        const staff = await this.activeStaff(this.prisma, actor);
        const where = MANAGER_ROLES.has(staff.role)
            ? { active: true }
            : { active: true, unit: { location: staff.point } };
        return this.prisma.loanerDevice.findMany({
            where,
            include: {
                unit: { include: { product: { select: { id: true, name: true, sku: true } } } },
                loans: { where: { status: { in: [...ACTIVE_LOAN_STATUSES, 'disputed'] } }, include: { workOrder: { include: { warrantyCase: true } } }, orderBy: { createdAt: 'desc' }, take: 1 },
            },
            orderBy: { createdAt: 'asc' },
        });
    }
    mine(customerId) {
        return this.prisma.loanerLoan.findMany({ where: { customerId }, include: loanInclude, orderBy: { createdAt: 'desc' } });
    }
    async register(dto, actor, rawKey) {
        const key = (0, service_command_1.requiredServiceKey)(rawKey);
        const imei = dto.imei.trim().toUpperCase();
        const condition = dto.condition.trim();
        const existing = await this.prisma.loanerDevice.findUnique({ where: { registrationIdempotencyKey: key }, include: { unit: true } });
        if (existing) {
            if (existing.unit.imei !== imei || existing.condition !== condition)
                throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован другой регистрацией');
            await this.assertRegistrationAccess(this.prisma, actor, existing.unit.location);
            return existing;
        }
        try {
            return await this.audit.transaction(async (tx) => {
                const staff = await this.activeStaff(tx, actor);
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'loaner-register:' + imei}))::text AS locked`;
                const replay = await tx.loanerDevice.findUnique({ where: { registrationIdempotencyKey: key }, include: { unit: true } });
                if (replay) {
                    this.assertRegistrationReplay(replay, imei, condition);
                    this.assertRegistrationStaffAccess(staff, replay.unit.location);
                    return { result: replay, events: [] };
                }
                const unit = await tx.deviceUnit.findUnique({ where: { imei } });
                if (!unit)
                    throw new errors_1.ValidationError('loaner_unit_not_found', 'IMEI не найден на складе');
                if (unit.status !== 'in_stock')
                    throw new errors_1.ConflictError('loaner_unit_unavailable', 'В подменный фонд можно добавить только свободное устройство');
                if (!MANAGER_ROLES.has(staff.role) && unit.location !== staff.point)
                    throw new errors_1.ConflictError('loaner_point_forbidden', 'Устройство относится к другой точке');
                const claimed = await tx.deviceUnit.updateMany({
                    where: { id: unit.id, status: 'in_stock' },
                    data: { status: 'loaner_available' },
                });
                if (claimed.count !== 1) {
                    throw new errors_1.ConflictError('loaner_unit_unavailable', 'Устройство перестало быть свободным — регистрация отменена');
                }
                const result = await tx.loanerDevice.create({ data: { unitId: unit.id, condition, registeredBy: actor, registrationIdempotencyKey: key }, include: { unit: true } });
                return { result, events: [{ type: event_types_1.EventType.ServiceLoanerRegistered, actor, payload: { loanerDeviceId: result.id, imei, location: unit.location, condition }, refs: [result.id, unit.id, imei] }] };
            });
        }
        catch (error) {
            if ((0, service_command_1.isServiceCommandUniqueViolation)(error)) {
                const replay = await this.prisma.loanerDevice.findUnique({ where: { registrationIdempotencyKey: key }, include: { unit: true } });
                if (replay) {
                    this.assertRegistrationReplay(replay, imei, condition);
                    await this.assertRegistrationAccess(this.prisma, actor, replay.unit.location);
                    return replay;
                }
            }
            throw error;
        }
    }
    async prepare(workOrderId, dto, actor, rawKey) {
        const key = (0, service_command_1.requiredServiceKey)(rawKey);
        const request = { workOrderId, loanerDeviceId: dto.loanerDeviceId, dueAt: dto.dueAt, issueCondition: dto.issueCondition.trim(), depositAmount: dto.depositAmount ?? 0, agreementRef: dto.agreementRef?.trim() ?? null };
        return this.command(workOrderId, key, 'prepare_loaner', request, actor, async (tx) => {
            await this.lockWorkOrder(tx, workOrderId);
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'loaner-device:' + dto.loanerDeviceId}))::text AS locked`;
            const workOrder = await tx.serviceWorkOrder.findUnique({ where: { id: workOrderId }, include: { warrantyCase: true } });
            if (!workOrder)
                throw new errors_1.ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
            await this.assertPointAccess(tx, actor, workOrder.point);
            if (['closed', 'rejected'].includes(workOrder.warrantyCase.status))
                throw new errors_1.ConflictError('loaner_work_order_closed', 'Ремонт уже закрыт');
            const dueAt = new Date(dto.dueAt);
            if (dueAt.getTime() <= Date.now())
                throw new errors_1.ValidationError('loaner_due_at_invalid', 'Срок возврата должен быть в будущем');
            const device = await tx.loanerDevice.findUnique({ where: { id: dto.loanerDeviceId }, include: { unit: true } });
            if (!device?.active || device.unit.status !== 'loaner_available')
                throw new errors_1.ConflictError('loaner_device_unavailable', 'Подменное устройство недоступно');
            if (device.unit.location !== workOrder.point)
                throw new errors_1.ConflictError('loaner_point_mismatch', 'Устройство и ремонт должны быть на одной точке');
            const active = await tx.loanerLoan.findFirst({ where: { OR: [{ deviceId: device.id }, { workOrderId }], status: { in: ACTIVE_LOAN_STATUSES } } });
            if (active)
                throw new errors_1.ConflictError('loaner_active_loan_exists', 'Устройство или ремонт уже имеют активную выдачу');
            const loan = await tx.loanerLoan.create({ data: { deviceId: device.id, workOrderId, customerId: workOrder.warrantyCase.customerId, dueAt, issueCondition: dto.issueCondition.trim(), depositAmount: dto.depositAmount ?? 0, agreementRef: dto.agreementRef?.trim() || null, preparedBy: actor }, include: loanInclude });
            if (loan.depositAmount > 0) {
                const entry = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                    idempotencyKey: `accounting:loaner.deposit:${loan.id}`,
                    sourceType: 'loaner.deposit',
                    sourceRef: loan.id,
                    description: `Залог за подменное устройство по ремонту ${workOrderId}`,
                    documentAmount: loan.depositAmount,
                    baseAmount: loan.depositAmount,
                    point: workOrder.point,
                    occurredAt: new Date(),
                    createdBy: actor,
                    lines: [
                        { accountCode: '1000', debit: loan.depositAmount, credit: 0, memo: 'Получен залог за подменное устройство' },
                        { accountCode: '2400', debit: 0, credit: loan.depositAmount, memo: 'Обязательство по залогу' },
                    ],
                });
                await (0, cash_drawer_1.recordCashDrawerMovementOnTx)(tx, {
                    idempotencyKey: `drawer:loaner.deposit:${loan.id}`,
                    staffId: actor,
                    amount: loan.depositAmount,
                    kind: 'loaner_deposit',
                    sourceType: 'loaner.deposit',
                    sourceRef: loan.id,
                    reason: 'Залог за подменное устройство',
                    createdBy: actor,
                    accountingEntryId: entry.id,
                });
            }
            return { result: loan, event: { type: event_types_1.EventType.ServiceLoanerPrepared, actor, payload: { loanId: loan.id, workOrderId, deviceId: device.id, dueAt: dueAt.toISOString(), depositAmount: loan.depositAmount }, refs: [loan.id, device.id, workOrderId, workOrder.warrantyCaseId, workOrder.warrantyCase.customerId] } };
        });
    }
    issue(loanId, actor, rawKey) {
        return this.loanCommand(loanId, actor, rawKey, 'issue_loaner', ['prepared'], async (tx, loan) => {
            await this.requireEvidence(tx, loan.id, 'loaner_issue');
            await tx.deviceUnit.update({ where: { id: loan.device.unitId }, data: { status: 'loaner_issued' } });
            const result = await tx.loanerLoan.update({ where: { id: loan.id }, data: { status: 'issued', issuedBy: actor, issuedAt: new Date() }, include: loanInclude });
            if (this.outbox) {
                await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                    customerId: loan.customerId,
                    template: 'service_loaner_issued',
                    payload: { loanId, workOrderId: loan.workOrderId, dueAt: loan.dueAt.toISOString() },
                    transactional: true,
                });
            }
            return { result, type: event_types_1.EventType.ServiceLoanerIssued, payload: { loanId, workOrderId: loan.workOrderId, deviceId: loan.deviceId, dueAt: loan.dueAt.toISOString() } };
        });
    }
    cancel(loanId, actor, rawKey) {
        return this.loanCommand(loanId, actor, rawKey, 'cancel_loaner', ['prepared'], async (tx, loan) => {
            const result = await tx.loanerLoan.update({ where: { id: loan.id }, data: { status: 'cancelled', returnedBy: actor }, include: loanInclude });
            return { result, type: event_types_1.EventType.ServiceLoanerCancelled, payload: { loanId, workOrderId: loan.workOrderId, deviceId: loan.deviceId } };
        });
    }
    returnLoan(loanId, dto, actor, rawKey) {
        return this.loanCommand(loanId, actor, rawKey, 'return_loaner', ['issued', 'overdue'], async (tx, loan) => {
            await this.requireEvidence(tx, loan.id, 'loaner_return');
            const disputed = Boolean(dto.damageNote?.trim());
            await tx.deviceUnit.update({ where: { id: loan.device.unitId }, data: { status: disputed ? 'in_repair' : 'loaner_available' } });
            const result = await tx.loanerLoan.update({ where: { id: loan.id }, data: { status: disputed ? 'disputed' : 'returned', returnCondition: dto.returnCondition.trim(), damageNote: dto.damageNote?.trim() || null, returnedBy: actor, returnedAt: new Date() }, include: loanInclude });
            if (!disputed && result.depositAmount > 0) {
                const refundEntry = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                    idempotencyKey: `accounting:loaner.deposit_refund:${loan.id}`,
                    sourceType: 'loaner.deposit_refund',
                    sourceRef: loan.id,
                    description: `Возврат залога по ремонту ${loan.workOrderId}`,
                    documentAmount: result.depositAmount,
                    baseAmount: result.depositAmount,
                    occurredAt: new Date(),
                    createdBy: actor,
                    lines: [
                        { accountCode: '2400', debit: result.depositAmount, credit: 0, memo: 'Погашение обязательства по залогу' },
                        { accountCode: '1000', debit: 0, credit: result.depositAmount, memo: 'Возврат залога клиенту' },
                    ],
                });
                await (0, cash_drawer_1.recordCashDrawerMovementOnTx)(tx, {
                    idempotencyKey: `drawer:loaner.deposit_refund:${loan.id}`,
                    staffId: actor,
                    amount: -result.depositAmount,
                    kind: 'loaner_deposit',
                    sourceType: 'loaner.deposit_refund',
                    sourceRef: loan.id,
                    reason: 'Возврат залога клиенту',
                    createdBy: actor,
                    accountingEntryId: refundEntry.id,
                });
            }
            return { result, type: disputed ? event_types_1.EventType.ServiceLoanerDisputed : event_types_1.EventType.ServiceLoanerReturned, payload: { loanId, workOrderId: loan.workOrderId, deviceId: loan.deviceId, disputed, damageNote: result.damageNote } };
        }, { returnCondition: dto.returnCondition.trim(), damageNote: dto.damageNote?.trim() ?? null });
    }
    resolveDispute(loanId, disposition, actor, rawKey) {
        return this.loanCommand(loanId, actor, rawKey, 'resolve_loaner_dispute', ['disputed'], async (tx, loan) => {
            const writtenOff = disposition === 'written_off';
            if (writtenOff && (await this.activeStaff(tx, actor)).role !== 'owner') {
                throw new errors_1.ForbiddenError('loaner_write_off_owner_required', 'Списание подменного IMEI подтверждает только владелец');
            }
            await tx.deviceUnit.update({ where: { id: loan.device.unitId }, data: { status: writtenOff ? 'written_off' : 'loaner_available' } });
            await tx.loanerDevice.update({ where: { id: loan.deviceId }, data: { active: !writtenOff } });
            const result = await tx.loanerLoan.update({ where: { id: loan.id }, data: { status: 'returned' }, include: loanInclude });
            return { result, type: event_types_1.EventType.ServiceLoanerDisputeResolved, payload: { loanId, workOrderId: loan.workOrderId, deviceId: loan.deviceId, disposition } };
        }, { disposition });
    }
    async loanCommand(loanId, actor, rawKey, action, allowed, mutate, extra = {}) {
        const key = (0, service_command_1.requiredServiceKey)(rawKey);
        const initial = await this.prisma.loanerLoan.findUnique({ where: { id: loanId }, select: { workOrderId: true } });
        if (!initial)
            throw new errors_1.ValidationError('loaner_loan_not_found', 'Выдача не найдена');
        const request = { loanId, ...extra };
        return this.command(initial.workOrderId, key, action, request, actor, async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'loaner-loan:' + loanId}))::text AS locked`;
            const loan = await tx.loanerLoan.findUnique({ where: { id: loanId }, include: loanInclude });
            if (!loan)
                throw new errors_1.ValidationError('loaner_loan_not_found', 'Выдача не найдена');
            await this.assertPointAccess(tx, actor, loan.workOrder.point);
            if (!allowed.includes(loan.status))
                throw new errors_1.ConflictError('loaner_transition_closed', 'Действие недоступно в текущем статусе выдачи');
            const changed = await mutate(tx, loan);
            return { result: changed.result, event: { type: changed.type, actor, payload: changed.payload, refs: [loan.id, loan.deviceId, loan.workOrderId, loan.customerId, loan.device.unit.imei] } };
        });
    }
    async command(workOrderId, key, action, request, actor, work) {
        await this.assertWorkOrderAccess(this.prisma, actor, workOrderId);
        const existing = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
        if (existing)
            return (0, service_command_1.replayServiceCommand)(existing, action, request);
        try {
            return await this.audit.transaction(async (tx) => {
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'service-command:' + key}))::text AS locked`;
                const raced = await tx.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (raced)
                    return { result: (0, service_command_1.replayServiceCommand)(raced, action, request), events: [] };
                const changed = await work(tx);
                await tx.serviceWorkOrderCommand.create({ data: { idempotencyKey: key, workOrderId, action, request: (0, service_command_1.serviceJson)(request), response: (0, service_command_1.serviceJson)(changed.result) } });
                return { result: changed.result, events: [changed.event] };
            });
        }
        catch (error) {
            if ((0, service_command_1.isServiceCommandUniqueViolation)(error)) {
                const replay = await this.prisma.serviceWorkOrderCommand.findUnique({ where: { idempotencyKey: key } });
                if (replay)
                    return (0, service_command_1.replayServiceCommand)(replay, action, request);
            }
            throw error;
        }
    }
    async requireEvidence(tx, loanId, label) {
        const events = await tx.auditEvent.findMany({ where: { type: event_types_1.EventType.EvidenceAttached, refs: { has: loanId } }, select: { actor: true, payload: true }, take: 50 });
        const found = events.some((event) => {
            const payload = event.payload;
            return payload.entityType === 'loaner'
                && payload.entityId === loanId
                && payload.label === label
                && payload.trustedStaffEvidence === true
                && typeof event.actor === 'string'
                && event.actor.startsWith('staff:');
        });
        if (!found)
            throw new errors_1.ConflictError('loaner_evidence_required', `Требуется фото: ${label}`);
    }
    async lockWorkOrder(tx, id) {
        const rows = await tx.$queryRaw `SELECT id FROM "ServiceWorkOrder" WHERE id = ${id} FOR UPDATE`;
        if (rows.length === 0)
            throw new errors_1.ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
    }
    async activeStaff(tx, actor) {
        const staff = await tx.staffUser.findUnique({ where: { id: actor }, select: { active: true, role: true, point: true } });
        if (!staff?.active)
            throw new errors_1.ValidationError('loaner_staff_inactive', 'Сотрудник не найден или отключён');
        return staff;
    }
    async assertPointAccess(tx, actor, point) {
        const staff = await this.activeStaff(tx, actor);
        if (!MANAGER_ROLES.has(staff.role) && (staff.role !== 'service' || staff.point !== point))
            throw new errors_1.ConflictError('loaner_point_forbidden', 'Нет доступа к подменному фонду этой точки');
    }
    async assertWorkOrderAccess(tx, actor, workOrderId) {
        const workOrder = await tx.serviceWorkOrder.findUnique({ where: { id: workOrderId }, select: { point: true } });
        if (!workOrder)
            throw new errors_1.ValidationError('service_work_order_not_found', 'Заказ-наряд не найден');
        const staff = await this.activeStaff(tx, actor);
        if (!MANAGER_ROLES.has(staff.role) && (staff.role !== 'service' || staff.point !== workOrder.point)) {
            throw new errors_1.ConflictError('loaner_point_forbidden', 'Нет доступа к подменному фонду этой точки');
        }
    }
    assertRegistrationReplay(existing, imei, condition) {
        if (existing.unit.imei !== imei || existing.condition !== condition) {
            throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован другой регистрацией');
        }
    }
    async assertRegistrationAccess(tx, actor, location) {
        this.assertRegistrationStaffAccess(await this.activeStaff(tx, actor), location);
    }
    assertRegistrationStaffAccess(staff, location) {
        if (!MANAGER_ROLES.has(staff.role) && staff.point !== location) {
            throw new errors_1.ForbiddenError('loaner_point_forbidden', 'Нет доступа к подменному фонду этой точки');
        }
    }
};
exports.ServiceLoanerService = ServiceLoanerService;
exports.ServiceLoanerService = ServiceLoanerService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        outbox_service_1.OutboxService])
], ServiceLoanerService);
//# sourceMappingURL=service-loaner.service.js.map