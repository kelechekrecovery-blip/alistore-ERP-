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
var ShiftsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShiftsService = exports.BLIND_COUNT_REASON = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const accounting_journal_1 = require("../finance/accounting-journal");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const outbox_service_1 = require("../outbox/outbox.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
exports.BLIND_COUNT_REASON = 'Слепой пересчёт кассы';
let ShiftsService = ShiftsService_1 = class ShiftsService {
    constructor(prisma, audit, outbox) {
        this.prisma = prisma;
        this.audit = audit;
        this.outbox = outbox;
    }
    async getForStaff(id, staffId, role) {
        const manager = role === client_1.Role.owner || role === client_1.Role.admin;
        const shift = await this.prisma.cashShift.findUnique({
            where: { id },
        });
        if (!shift)
            return null;
        if (shift.staffId === staffId)
            return shift;
        if (!manager)
            return null;
        return this.prisma.cashShift.findUnique({
            where: { id },
            include: { payments: true },
        });
    }
    currentOpen(staffId) {
        return this.prisma.cashShift.findFirst({
            where: { staffId, closedAt: null },
        });
    }
    async openShifts(point, staffId, role, staffPoint) {
        const manager = role === client_1.Role.owner || role === client_1.Role.admin;
        const staff = await this.prisma.staffUser.findMany({
            where: {
                active: true,
                ...(!manager && staffPoint ? { point: staffPoint } : {}),
                role: {
                    in: manager
                        ? ['cashier', 'seller', 'senior_seller', 'franchise', 'admin', 'owner']
                        : ['cashier', 'seller', 'senior_seller'],
                },
            },
            select: { id: true, username: true, role: true },
            orderBy: { username: 'asc' },
        });
        const names = new Map(staff.map((person) => [person.id, person]));
        const where = {
            closedAt: null,
            ...(point?.trim() ? { point: point.trim() } : {}),
        };
        if (!manager) {
            const shifts = await this.prisma.cashShift.findMany({
                where: { ...where, staffId },
                orderBy: { openedAt: 'asc' },
            });
            return {
                shifts: shifts.map((shift) => ({ ...shift, staff: names.get(shift.staffId) ?? null })),
                staff,
            };
        }
        const shifts = await this.prisma.cashShift.findMany({
            where,
            include: { payments: { where: { method: 'cash' }, select: { amount: true } } },
            orderBy: { openedAt: 'asc' },
        });
        return {
            shifts: shifts.map((shift) => ({
                ...shift,
                ...(shift.staffId === staffId
                    ? {}
                    : { expectedCash: shift.openCash + shift.payments.reduce((sum, payment) => sum + payment.amount, 0) }),
                staff: names.get(shift.staffId) ?? null,
                payments: undefined,
            })),
            staff,
        };
    }
    async open(dto, actor, idempotencyKey) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'shift-open:' + dto.staffId}))::text AS locked`;
            if (idempotencyKey) {
                const replay = await tx.cashShift.findUnique({ where: { openIdempotencyKey: idempotencyKey } });
                if (replay) {
                    if (replay.staffId !== dto.staffId || replay.point !== dto.point || replay.openCash !== dto.openCash) {
                        throw new errors_1.ConflictError('shift_idempotency_mismatch', 'Ключ открытия смены уже использован для другой команды');
                    }
                    return { result: replay, events: [] };
                }
            }
            const existing = await tx.cashShift.findFirst({ where: { staffId: dto.staffId, closedAt: null } });
            if (existing) {
                throw new errors_1.ConflictError('shift_already_open', `У сотрудника ${dto.staffId} уже открыта смена ${existing.id}`);
            }
            const shift = await tx.cashShift.create({
                data: { staffId: dto.staffId, point: dto.point, openCash: dto.openCash, openIdempotencyKey: idempotencyKey },
            });
            if (this.outbox) {
                await (0, customer_notifications_1.enqueueStaffNotice)(tx, this.outbox, {
                    template: 'shift_opened',
                    title: 'Смена открыта',
                    body: `${dto.point} · размен ${dto.openCash} сом`,
                    payload: { shiftId: shift.id, staffId: dto.staffId, point: dto.point, openCash: dto.openCash, deepLink: `alistore-admin://shifts/${shift.id}` },
                });
            }
            return {
                result: shift,
                events: [
                    {
                        type: event_types_1.EventType.ShiftOpened,
                        actor,
                        payload: {
                            shiftId: shift.id,
                            staffId: dto.staffId,
                            point: dto.point,
                            openCash: dto.openCash,
                        },
                        refs: [shift.id],
                    },
                ],
            };
        });
    }
    async expectedCash(tx, shiftId, openCash) {
        const [payments, movements] = await Promise.all([
            tx.payment.aggregate({ _sum: { amount: true }, where: { shiftId, method: 'cash' } }),
            tx.cashDrawerMovement.aggregate({ _sum: { amount: true }, where: { shiftId } }),
        ]);
        return openCash + (payments._sum.amount ?? 0) + (movements._sum.amount ?? 0);
    }
    async assertNoPendingCashRefunds(tx, shiftId) {
        const pending = await tx.refundAllocation.count({
            where: {
                shiftId,
                status: { in: ['queued', 'processing', 'provider_pending', 'failed'] },
                refund: { status: { in: ['requested', 'approved', 'processing', 'partially_succeeded', 'failed'] } },
            },
        });
        if (pending > 0) {
            throw new errors_1.ConflictError('shift_has_pending_refunds', 'Смену нельзя закрыть или передать, пока наличный возврат не исполнен или не отклонён');
        }
    }
    assertOwnerOrManager(shiftStaffId, actor, actorRole) {
        const manager = actorRole === client_1.Role.owner || actorRole === client_1.Role.admin;
        if (shiftStaffId !== actor && !manager) {
            throw new common_1.NotFoundException('Смена не найдена');
        }
    }
    closeReason(shiftStaffId, actor, actorRole, diff, requestedReason) {
        const reason = requestedReason?.trim() || null;
        if (diff === 0 || reason)
            return reason;
        const selfBlindCount = shiftStaffId === actor && actorRole !== undefined;
        return selfBlindCount ? ShiftsService_1.BLIND_COUNT_REASON : null;
    }
    async close(shiftId, dto, actor, idempotencyKey, actorRole) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'shift-close:' + shiftId}))::text AS locked`;
            await tx.$queryRaw `SELECT id FROM "CashShift" WHERE id = ${shiftId} FOR UPDATE`;
            const shift = await tx.cashShift.findUnique({ where: { id: shiftId } });
            if (!shift) {
                throw new common_1.NotFoundException('Смена не найдена');
            }
            if (actorRole !== undefined) {
                this.assertOwnerOrManager(shift.staffId, actor, actorRole);
            }
            if (shift.closedAt) {
                if (idempotencyKey && shift.closeIdempotencyKey === idempotencyKey) {
                    const replayReason = this.closeReason(shift.staffId, actor, actorRole, shift.diff ?? 0, dto.reason);
                    if (shift.closeCash !== dto.closeCash ||
                        (shift.closeReason ?? null) !== replayReason) {
                        throw new errors_1.ConflictError('shift_idempotency_mismatch', 'Ключ закрытия смены уже использован для другой команды');
                    }
                    return {
                        result: { ...shift, expected: shift.closeCash - (shift.diff ?? 0) },
                        events: [],
                    };
                }
                throw new errors_1.ConflictError('shift_already_closed', `Смена ${shiftId} уже закрыта`);
            }
            if (idempotencyKey) {
                const used = await tx.cashShift.findUnique({ where: { closeIdempotencyKey: idempotencyKey } });
                if (used && used.id !== shiftId) {
                    throw new errors_1.ConflictError('shift_idempotency_mismatch', 'Ключ закрытия смены уже использован');
                }
            }
            await this.assertNoPendingCashRefunds(tx, shiftId);
            const expected = await this.expectedCash(tx, shiftId, shift.openCash);
            const diff = dto.closeCash - expected;
            const reason = this.closeReason(shift.staffId, actor, actorRole, diff, dto.reason);
            const userNote = dto.reason?.trim() || null;
            if (diff !== 0 && !reason) {
                throw new errors_1.ValidationError('reconciliation_reason_required', 'Расхождение кассы требует причину');
            }
            const events = [];
            const closed = await tx.cashShift.update({
                where: { id: shiftId },
                data: {
                    closeCash: dto.closeCash,
                    closeReason: reason,
                    closeIdempotencyKey: idempotencyKey,
                    diff,
                    closedAt: new Date(),
                },
            });
            events.push({
                type: event_types_1.EventType.ShiftClosed,
                actor,
                payload: {
                    shiftId,
                    expected,
                    closeCash: dto.closeCash,
                    diff,
                    reason,
                    reconciliationMode: shift.staffId === actor ? 'blind' : 'manager',
                    reasonSource: userNote ? 'user' : 'system',
                    userNote,
                },
                refs: [shiftId],
            });
            if (diff !== 0) {
                await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                    idempotencyKey: `accounting:shift.reconciliation:${shiftId}`,
                    sourceType: 'shift.reconciliation',
                    sourceRef: shiftId,
                    description: `Расхождение кассы по смене ${shiftId}`,
                    documentAmount: Math.abs(diff),
                    baseAmount: Math.abs(diff),
                    point: shift.point,
                    occurredAt: closed.closedAt ?? new Date(),
                    createdBy: actor,
                    lines: diff < 0
                        ? [
                            { accountCode: '6990', debit: -diff, credit: 0, memo: 'Недостача кассы' },
                            { accountCode: '1000', debit: 0, credit: -diff, memo: 'Выбытие наличных из кассы' },
                        ]
                        : [
                            { accountCode: '1000', debit: diff, credit: 0, memo: 'Излишек наличных в кассе' },
                            { accountCode: '6990', debit: 0, credit: diff, memo: 'Излишек кассы' },
                        ],
                });
                events.push({
                    type: event_types_1.EventType.CashShortage,
                    actor,
                    payload: {
                        shiftId,
                        diff,
                        reason,
                        reconciliationMode: shift.staffId === actor ? 'blind' : 'manager',
                        reasonSource: userNote ? 'user' : 'system',
                        userNote,
                    },
                    refs: [shiftId],
                });
            }
            if (this.outbox) {
                await (0, customer_notifications_1.enqueueStaffNotice)(tx, this.outbox, {
                    template: 'shift_closed',
                    title: 'Смена закрыта',
                    body: diff === 0 ? `Касса сошлась: ${dto.closeCash} сом` : `Расхождение кассы ${diff} сом`,
                    payload: { shiftId, expected, closeCash: dto.closeCash, diff, deepLink: `alistore-admin://shifts/${shiftId}` },
                });
                if (diff !== 0) {
                    await (0, customer_notifications_1.enqueueStaffNotice)(tx, this.outbox, {
                        template: 'cash_shortage',
                        title: 'Недостача кассы',
                        body: `${diff} сом · ${reason}`,
                        payload: { shiftId, diff, deepLink: `alistore-admin://shifts/${shiftId}` },
                    });
                }
            }
            return { result: { ...closed, expected }, events };
        });
    }
    async handover(shiftId, dto, actor, actorRole, rawKey) {
        const key = rawKey?.trim();
        if (!key || key.length > 100)
            throw new errors_1.ValidationError('idempotency_key_required', 'Требуется Idempotency-Key до 100 символов');
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'shift-handover-key:' + key}))::text AS locked`;
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'shift-handover:' + shiftId}))::text AS locked`;
            await tx.$queryRaw `SELECT id FROM "CashShift" WHERE id = ${shiftId} FOR UPDATE`;
            const source = await tx.cashShift.findUnique({ where: { id: shiftId } });
            if (!source)
                throw new common_1.NotFoundException('Смена не найдена');
            this.assertOwnerOrManager(source.staffId, actor, actorRole);
            const replay = await tx.cashShiftHandover.findUnique({ where: { idempotencyKey: key } });
            if (replay) {
                const replayReason = this.closeReason(source.staffId, actor, actorRole, replay.diff, dto.reason);
                if (replay.fromShiftId !== shiftId || replay.toStaffId !== dto.toStaffId || replay.countedCash !== dto.countedCash || replay.reason !== replayReason)
                    throw new errors_1.ConflictError('shift_idempotency_mismatch', 'Ключ передачи уже использован для другой команды');
                const targetShift = await tx.cashShift.findUniqueOrThrow({ where: { id: replay.toShiftId } });
                return { result: { handover: replay, targetShift }, events: [] };
            }
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'shift-open:' + dto.toStaffId}))::text AS locked`;
            if (source.closedAt)
                throw new errors_1.ConflictError('shift_already_closed', 'Закрытую смену нельзя передать');
            await this.assertNoPendingCashRefunds(tx, source.id);
            if (source.staffId === dto.toStaffId)
                throw new errors_1.ValidationError('shift_handover_same_staff', 'Получатель должен отличаться от передающего');
            const target = await tx.staffUser.findUnique({ where: { id: dto.toStaffId } });
            if (!target?.active || !['cashier', 'seller', 'senior_seller', 'franchise', 'admin', 'owner'].includes(target.role))
                throw new errors_1.ValidationError('shift_handover_target_invalid', 'Получатель неактивен или не может работать с кассой');
            if (target.point !== source.point) {
                throw new errors_1.ValidationError('shift_handover_point_mismatch', 'Получатель должен работать в той же точке');
            }
            const targetOpen = await tx.cashShift.findFirst({ where: { staffId: dto.toStaffId, closedAt: null } });
            if (targetOpen)
                throw new errors_1.ConflictError('shift_already_open', 'У получателя уже есть открытая кассовая смена');
            const expected = await this.expectedCash(tx, source.id, source.openCash);
            const diff = dto.countedCash - expected;
            const reason = this.closeReason(source.staffId, actor, actorRole, diff, dto.reason);
            const userNote = dto.reason?.trim() || null;
            if (diff !== 0 && !reason)
                throw new errors_1.ValidationError('reconciliation_reason_required', 'Расхождение кассы требует причину');
            const closedAt = new Date();
            await tx.cashShift.update({ where: { id: source.id }, data: { closeCash: dto.countedCash, closeReason: reason, closeIdempotencyKey: `handover:${key}:close`, diff, closedAt } });
            const targetShift = await tx.cashShift.create({ data: { staffId: dto.toStaffId, point: source.point, openCash: dto.countedCash, openIdempotencyKey: `handover:${key}:open` } });
            const handover = await tx.cashShiftHandover.create({ data: { idempotencyKey: key, fromShiftId: source.id, toShiftId: targetShift.id, fromStaffId: source.staffId, toStaffId: dto.toStaffId, point: source.point, expectedCash: expected, countedCash: dto.countedCash, diff, reason, createdBy: actor } });
            const events = [
                { type: event_types_1.EventType.ShiftClosed, actor, payload: { shiftId: source.id, expected, closeCash: dto.countedCash, diff, reason, reconciliationMode: source.staffId === actor ? 'blind' : 'manager', reasonSource: userNote ? 'user' : 'system', userNote, handoverId: handover.id }, refs: [source.id, handover.id] },
                { type: event_types_1.EventType.CashHandover, actor, payload: { handoverId: handover.id, fromShiftId: source.id, toShiftId: targetShift.id, fromStaffId: source.staffId, toStaffId: dto.toStaffId, amount: dto.countedCash, diff }, refs: [handover.id, source.id, targetShift.id] },
                { type: event_types_1.EventType.ShiftOpened, actor, payload: { shiftId: targetShift.id, staffId: dto.toStaffId, point: source.point, openCash: dto.countedCash, handoverId: handover.id }, refs: [targetShift.id, handover.id] },
            ];
            if (diff !== 0)
                events.splice(1, 0, { type: event_types_1.EventType.CashShortage, actor, payload: { shiftId: source.id, diff, reason, reconciliationMode: source.staffId === actor ? 'blind' : 'manager', reasonSource: userNote ? 'user' : 'system', userNote, handoverId: handover.id }, refs: [source.id, handover.id] });
            return { result: { handover, targetShift }, events };
        });
    }
};
exports.ShiftsService = ShiftsService;
ShiftsService.BLIND_COUNT_REASON = exports.BLIND_COUNT_REASON;
exports.ShiftsService = ShiftsService = ShiftsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        outbox_service_1.OutboxService])
], ShiftsService);
//# sourceMappingURL=shifts.service.js.map