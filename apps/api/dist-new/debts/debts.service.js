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
exports.DebtsService = exports.DEBT_LIMIT = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const approvals_service_1 = require("../approvals/approvals.service");
const outbox_service_1 = require("../outbox/outbox.service");
const settings_service_1 = require("../settings/settings.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
const debt_insert_1 = require("./debt-insert");
const accounting_journal_1 = require("../finance/accounting-journal");
exports.DEBT_LIMIT = 50_000;
const DEFAULT_TERM_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REMINDER_DAYS = 3;
const DEFAULT_REMINDER_LIMIT = 100;
const REMINDER_SWEEP_TIMEOUT_MS = 30_000;
const REMINDER_SWEEP_MAX_WAIT_MS = 10_000;
const REMINDER_KINDS = ['debt_due_soon', 'debt_overdue'];
let DebtsService = class DebtsService {
    constructor(prisma, audit, approvals, outbox, settings) {
        this.prisma = prisma;
        this.audit = audit;
        this.approvals = approvals;
        this.outbox = outbox;
        this.settings = settings;
    }
    async resolveCashShiftOnTx(tx, actor) {
        const candidate = await tx.cashShift.findFirst({
            where: { staffId: actor, closedAt: null },
            select: { id: true },
            orderBy: { openedAt: 'desc' },
        });
        if (!candidate) {
            throw new errors_1.ConflictError('cash_shift_required', 'Для наличного погашения нужна открытая кассовая смена');
        }
        await tx.$queryRaw `SELECT id FROM "CashShift" WHERE id = ${candidate.id} FOR UPDATE`;
        const shift = await tx.cashShift.findUnique({ where: { id: candidate.id } });
        if (!shift || shift.closedAt) {
            throw new errors_1.ConflictError('cash_shift_closed', 'Нельзя добавить погашение в закрытую кассовую смену');
        }
        return shift;
    }
    get(id) {
        return this.prisma.debtPlan.findUnique({ where: { id } });
    }
    list(filter) {
        return this.prisma.debtPlan.findMany({
            where: {
                ...(filter.customerId ? { customerId: filter.customerId } : {}),
                ...(filter.status ? { status: filter.status } : {}),
            },
            orderBy: { dueDate: 'asc' },
            take: 100,
        });
    }
    async create(dto, actor) {
        const idempotencyKey = dto.idempotencyKey?.trim() || null;
        if (idempotencyKey) {
            const replay = await this.prisma.debtPlan.findUnique({ where: { idempotencyKey } });
            if (replay) {
                if (replay.orderId === dto.orderId
                    && replay.principal === dto.principal
                    && replay.installments === (dto.installments ?? 1))
                    return replay;
                throw new errors_1.ConflictError('debt_idempotency_conflict', 'Ключ создания долга уже использован с другими параметрами');
            }
        }
        const order = await this.prisma.order.findUnique({
            where: { id: dto.orderId },
            include: { payments: { select: { amount: true, status: true } } },
        });
        if (!order) {
            throw new errors_1.ValidationError('order_not_found', `Заказ ${dto.orderId} не найден`);
        }
        const dueDate = new Date(Date.now() + (dto.termDays ?? DEFAULT_TERM_DAYS) * DAY_MS);
        const input = {
            orderId: dto.orderId,
            customerId: order.customerId,
            principal: dto.principal,
            installments: dto.installments ?? 1,
            dueDate,
            idempotencyKey,
        };
        const received = order.payments
            .filter((payment) => payment.amount > 0 && ['received', 'reconciled'].includes(payment.status))
            .reduce((sum, payment) => sum + payment.amount, 0);
        const outstanding = Math.max(0, order.total - received);
        if (dto.principal > outstanding) {
            throw new errors_1.ValidationError('debt_principal_exceeds_outstanding', `Непокрытый остаток заказа: ${outstanding}`);
        }
        const existing = await this.prisma.debtPlan.findUnique({ where: { orderId: dto.orderId } });
        if (existing)
            throw new errors_1.ConflictError('order_debt_exists', 'Для заказа уже оформлен долг или рассрочка');
        const debtLimit = await this.settings.value('credit.debt_limit_som');
        if (dto.principal > debtLimit) {
            return this.approvals.request({
                action: 'debt',
                requester: actor,
                reason: dto.reason ?? `Долг ${dto.principal} сом (> лимита ${debtLimit})`,
                payload: { ...input, dueDate: dueDate.toISOString() },
            });
        }
        return this.audit.transaction(async (tx) => {
            const events = [];
            const debt = await (0, debt_insert_1.insertDebt)(tx, input, actor, events);
            return { result: debt, events };
        });
    }
    async pay(id, dto, actor) {
        return this.audit.transaction(async (tx) => {
            const commandKey = dto.idempotencyKey?.trim() || null;
            if (commandKey) {
                const replay = await tx.payment.findUnique({ where: { idempotencyKey: `debt:${commandKey}` } });
                if (replay) {
                    if (replay.orderId === null || replay.amount !== dto.amount)
                        throw new errors_1.ConflictError('debt_payment_idempotency_conflict', 'Ключ погашения уже использован с другой суммой');
                    const replayDebt = await tx.debtPlan.findUniqueOrThrow({ where: { id } });
                    if (replayDebt.orderId !== replay.orderId)
                        throw new errors_1.ConflictError('debt_payment_idempotency_conflict', 'Ключ погашения принадлежит другому долгу');
                    return { result: { debt: replayDebt, paymentId: replay.id, settled: replayDebt.status === 'settled', idempotent: true }, events: [] };
                }
            }
            const debt = await tx.debtPlan.findUnique({ where: { id } });
            if (!debt) {
                throw new errors_1.ValidationError('debt_not_found', `Долг ${id} не найден`);
            }
            if (debt.status !== 'open') {
                throw new errors_1.ConflictError('debt_not_open', `Долг ${id} уже ${debt.status}`);
            }
            if (dto.amount <= 0 || dto.amount > debt.balance) {
                throw new errors_1.ValidationError('invalid_debt_payment', `Сумма должна быть в пределах остатка (${debt.balance})`);
            }
            const dec = await tx.debtPlan.updateMany({
                where: { id, status: 'open', balance: { gte: dto.amount } },
                data: { balance: { decrement: dto.amount } },
            });
            if (dec.count === 0) {
                throw new errors_1.ConflictError('debt_payment_conflict', `Долг ${id} изменился — повторите`);
            }
            const decremented = await tx.debtPlan.findUniqueOrThrow({ where: { id } });
            const balance = decremented.balance;
            const settled = balance === 0;
            const updated = settled
                ? await tx.debtPlan.update({ where: { id }, data: { status: 'settled' } })
                : decremented;
            const method = dto.method ?? 'cash';
            const cashShift = method === 'cash'
                ? await this.resolveCashShiftOnTx(tx, actor)
                : null;
            const payment = await tx.payment.create({
                data: {
                    orderId: debt.orderId,
                    amount: dto.amount,
                    method,
                    status: 'received',
                    accountCode: (0, accounting_journal_1.paymentAccountCode)(method),
                    shiftId: cashShift?.id ?? null,
                    point: cashShift?.point ?? null,
                    idempotencyKey: commandKey ? `debt:${commandKey}` : undefined,
                    receivedBy: actor,
                },
            });
            const accountingEntry = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                idempotencyKey: `accounting:debt.payment:${payment.id}`,
                sourceType: 'debt.payment',
                sourceRef: payment.id,
                description: `Погашение долга ${id}`,
                occurredAt: payment.createdAt,
                createdBy: actor,
                lines: [
                    { accountCode: (0, accounting_journal_1.paymentAccountCode)(method), debit: dto.amount, memo: 'Получение платежа по рассрочке' },
                    { accountCode: '1100', credit: dto.amount, memo: 'Уменьшение дебиторской задолженности' },
                ],
            });
            await tx.payment.update({ where: { id: payment.id }, data: { accountingEntryId: accountingEntry.id } });
            const events = [
                {
                    type: event_types_1.EventType.DebtPaid,
                    actor,
                    payload: { debtId: id, amount: dto.amount, balance, paymentId: payment.id },
                    refs: [id, debt.orderId, payment.id],
                },
            ];
            events.push({
                type: event_types_1.EventType.AccountingEntryPosted,
                actor,
                payload: { accountingEntryId: accountingEntry.id, sourceType: 'debt.payment', sourceRef: payment.id, debtId: id, amount: dto.amount },
                refs: [accountingEntry.id, payment.id, id],
            });
            if (settled) {
                events.push({
                    type: event_types_1.EventType.DebtSettled,
                    actor,
                    payload: { debtId: id, orderId: debt.orderId, principal: debt.principal },
                    refs: [id, debt.orderId, debt.customerId],
                });
            }
            return { result: { debt: updated, paymentId: payment.id, settled, idempotent: false }, events };
        });
    }
    async enqueueReminders(options, actor = 'system') {
        const now = options?.now ?? new Date();
        const dueSoonDays = options?.dueSoonDays ?? DEFAULT_REMINDER_DAYS;
        const limit = options?.limit ?? DEFAULT_REMINDER_LIMIT;
        const dueSoonUntil = new Date(now.getTime() + dueSoonDays * DAY_MS);
        return this.audit.transaction(async (tx) => {
            const debts = await tx.debtPlan.findMany({
                where: {
                    status: 'open',
                    dueDate: { lte: dueSoonUntil },
                },
                orderBy: { dueDate: 'asc' },
                take: limit,
            });
            const events = [];
            let queued = 0;
            const debtIds = new Set(debts.map((debt) => debt.id));
            const queuedEvents = await tx.auditEvent.findMany({
                where: {
                    type: event_types_1.EventType.DebtReminderQueued,
                    refs: { hasSome: [...debtIds] },
                },
                select: { refs: true },
            });
            const alreadyQueuedKeys = new Set(queuedEvents.flatMap((event) => {
                const kinds = REMINDER_KINDS.filter((kind) => event.refs.includes(kind));
                return event.refs
                    .filter((ref) => debtIds.has(ref))
                    .flatMap((ref) => kinds.map((kind) => `${ref}:${kind}`));
            }));
            for (const debt of debts) {
                const kind = debt.dueDate.getTime() <= now.getTime() ? 'debt_overdue' : 'debt_due_soon';
                if (alreadyQueuedKeys.has(`${debt.id}:${kind}`))
                    continue;
                const daysUntilDue = Math.ceil((debt.dueDate.getTime() - now.getTime()) / DAY_MS);
                const queuedNotice = await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                    customerId: debt.customerId,
                    template: kind,
                    payload: {
                        debtId: debt.id,
                        orderId: debt.orderId,
                        customerId: debt.customerId,
                        balance: debt.balance,
                        dueDate: debt.dueDate.toISOString(),
                        daysUntilDue,
                    },
                });
                if (!queuedNotice)
                    continue;
                events.push({
                    type: event_types_1.EventType.DebtReminderQueued,
                    actor,
                    payload: {
                        debtId: debt.id,
                        orderId: debt.orderId,
                        customerId: debt.customerId,
                        kind,
                        balance: debt.balance,
                        dueDate: debt.dueDate.toISOString(),
                        daysUntilDue,
                    },
                    refs: [debt.id, debt.orderId, debt.customerId, kind],
                });
                queued += 1;
            }
            return { result: { considered: debts.length, queued }, events };
        }, { timeout: REMINDER_SWEEP_TIMEOUT_MS, maxWait: REMINDER_SWEEP_MAX_WAIT_MS });
    }
};
exports.DebtsService = DebtsService;
exports.DebtsService = DebtsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        approvals_service_1.ApprovalsService,
        outbox_service_1.OutboxService,
        settings_service_1.SettingsService])
], DebtsService);
//# sourceMappingURL=debts.service.js.map