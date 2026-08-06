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
exports.GiftcardsService = void 0;
exports.normalizeCode = normalizeCode;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const accounting_journal_1 = require("../finance/accounting-journal");
const cash_drawer_1 = require("../shifts/cash-drawer");
let GiftcardsService = class GiftcardsService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async issue(dto, actor, idempotencyKey) {
        if (idempotencyKey) {
            const replay = await this.prisma.giftCard.findUnique({ where: { idempotencyKey } });
            if (replay) {
                if (replay.initialBalance !== dto.amount) {
                    throw new errors_1.ConflictError('giftcard_idempotency_conflict', `Ключ идемпотентности уже использован для карты на ${replay.initialBalance}`);
                }
                return this.view(replay);
            }
        }
        const code = normalizeCode(dto.code ?? this.generateCode());
        const existing = await this.prisma.giftCard.findUnique({ where: { code } });
        if (existing) {
            throw new errors_1.ConflictError('giftcard_code_exists', `Подарочная карта ${code} уже существует`);
        }
        const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
        const card = await this.audit.transaction(async (tx) => {
            const created = await tx.giftCard.create({
                data: {
                    code,
                    idempotencyKey,
                    initialBalance: dto.amount,
                    balance: dto.amount,
                    customerId: dto.customerId,
                    issuedBy: actor,
                    note: dto.note,
                    expiresAt,
                },
            });
            const method = dto.method ?? 'cash';
            const entry = await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                idempotencyKey: `accounting:giftcard.issued:${created.id}`,
                sourceType: 'giftcard.issued',
                sourceRef: created.id,
                description: `Выпуск подарочной карты ${created.code}`,
                documentAmount: dto.amount,
                baseAmount: dto.amount,
                occurredAt: created.createdAt,
                createdBy: actor,
                lines: [
                    { accountCode: (0, accounting_journal_1.paymentAccountCode)(method), debit: dto.amount, credit: 0, memo: 'Оплата подарочной карты' },
                    { accountCode: '2300', debit: 0, credit: dto.amount, memo: 'Обязательство по подарочной карте' },
                ],
            });
            if (method === 'cash') {
                await (0, cash_drawer_1.recordCashDrawerMovementOnTx)(tx, {
                    idempotencyKey: `drawer:giftcard.issued:${created.id}`,
                    staffId: actor,
                    amount: dto.amount,
                    kind: 'giftcard_issue',
                    sourceType: 'giftcard.issued',
                    sourceRef: created.id,
                    reason: `Продажа подарочной карты ${created.code}`,
                    createdBy: actor,
                    accountingEntryId: entry.id,
                });
            }
            return {
                result: created,
                events: [
                    {
                        type: event_types_1.EventType.GiftCardIssued,
                        actor,
                        payload: {
                            giftCardId: created.id,
                            code,
                            amount: dto.amount,
                            customerId: dto.customerId ?? null,
                            expiresAt: expiresAt?.toISOString() ?? null,
                        },
                        refs: [created.id, code, ...(dto.customerId ? [dto.customerId] : [])],
                    },
                ],
            };
        });
        return this.view(card);
    }
    async getByCode(code) {
        const card = await this.prisma.giftCard.findUnique({ where: { code: normalizeCode(code) } });
        if (!card) {
            throw new errors_1.ValidationError('giftcard_not_found', 'Подарочная карта не найдена');
        }
        return this.view(card);
    }
    async redeemOnTx(tx, codeInput, orderId, amount, actor, events) {
        if (amount <= 0) {
            throw new errors_1.ValidationError('invalid_giftcard_amount', 'Сумма списания должна быть больше 0');
        }
        const code = normalizeCode(codeInput);
        const now = new Date();
        const { count } = await tx.giftCard.updateMany({
            where: {
                code,
                status: 'active',
                balance: { gte: amount },
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            data: { balance: { decrement: amount } },
        });
        if (count === 0) {
            await this.raiseRedeemError(tx, code, amount, now);
        }
        let card = await tx.giftCard.findUnique({ where: { code } });
        if (!card) {
            throw new errors_1.ValidationError('giftcard_not_found', 'Подарочная карта не найдена');
        }
        if (card.balance === 0 && card.status === 'active') {
            card = await tx.giftCard.update({
                where: { id: card.id },
                data: { status: 'redeemed' },
            });
        }
        events.push({
            type: event_types_1.EventType.GiftCardRedeemed,
            actor,
            payload: {
                giftCardId: card.id,
                code,
                orderId,
                amount,
                balance: card.balance,
            },
            refs: [card.id, code, orderId],
        });
        return card;
    }
    async raiseRedeemError(tx, code, amount, now) {
        const card = await tx.giftCard.findUnique({ where: { code } });
        if (!card) {
            throw new errors_1.ValidationError('giftcard_not_found', 'Подарочная карта не найдена');
        }
        if (card.status !== 'active') {
            throw new errors_1.ConflictError('giftcard_not_active', `Подарочная карта уже ${card.status}`);
        }
        if (card.expiresAt && card.expiresAt <= now) {
            await tx.giftCard.update({ where: { id: card.id }, data: { status: 'expired' } });
            throw new errors_1.ConflictError('giftcard_expired', 'Срок действия подарочной карты истёк');
        }
        if (card.balance < amount) {
            throw new errors_1.ConflictError('giftcard_insufficient_balance', `На подарочной карте осталось ${card.balance}`);
        }
        throw new errors_1.ConflictError('giftcard_not_redeemable', 'Подарочную карту нельзя списать');
    }
    view(card) {
        return {
            id: card.id,
            code: card.code,
            initialBalance: card.initialBalance,
            balance: card.balance,
            currency: card.currency,
            status: card.status,
            customerId: card.customerId,
            expiresAt: card.expiresAt,
            redeemable: card.status === 'active' && card.balance > 0 && (!card.expiresAt || card.expiresAt > new Date()),
        };
    }
    generateCode() {
        return `GC-${(0, crypto_1.randomBytes)(6).toString('hex').toUpperCase()}`;
    }
};
exports.GiftcardsService = GiftcardsService;
exports.GiftcardsService = GiftcardsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], GiftcardsService);
function normalizeCode(code) {
    return code.trim().toUpperCase();
}
//# sourceMappingURL=giftcards.service.js.map