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
exports.TradeInsService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const outbox_service_1 = require("../outbox/outbox.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
const prisma_service_1 = require("../prisma/prisma.service");
const accounting_journal_1 = require("../finance/accounting-journal");
const inventory_valuation_1 = require("../inventory/inventory-valuation");
const cash_drawer_1 = require("../shifts/cash-drawer");
const prisma_errors_1 = require("../common/prisma-errors");
const settings_service_1 = require("../settings/settings.service");
const valuation_1 = require("./valuation");
let TradeInsService = class TradeInsService {
    constructor(prisma, audit, outbox, settings) {
        this.prisma = prisma;
        this.audit = audit;
        this.outbox = outbox;
        this.settings = settings;
    }
    async valuation() {
        const read = async (key) => this.settings ? this.settings.value(key) : undefined;
        const [i15, i14, i13, i12, mac, ipad, pods, other, gradeB, gradeC, round] = await Promise.all([
            read('tradein.base.iphone_15_som'),
            read('tradein.base.iphone_14_som'),
            read('tradein.base.iphone_13_som'),
            read('tradein.base.iphone_12_som'),
            read('tradein.base.macbook_som'),
            read('tradein.base.ipad_som'),
            read('tradein.base.airpods_som'),
            read('tradein.base.default_som'),
            read('tradein.grade_b_bps'),
            read('tradein.grade_c_bps'),
            read('tradein.round_som'),
        ]);
        return {
            tiers: [
                { match: 'iphone 15', baseSom: i15 ?? 65_000 },
                { match: 'iphone 14', baseSom: i14 ?? 52_000 },
                { match: 'iphone 13', baseSom: i13 ?? 38_000 },
                { match: 'iphone 12', baseSom: i12 ?? 28_000 },
                { match: 'macbook', baseSom: mac ?? 70_000 },
                { match: 'ipad', baseSom: ipad ?? 32_000 },
                { match: 'airpods', baseSom: pods ?? 8_000 },
            ],
            defaultBaseSom: other ?? 30_000,
            gradeFactorsBps: { A: 10_000, B: gradeB ?? 8_200, C: gradeC ?? 6_200 },
            roundToSom: round ?? 500,
        };
    }
    async estimate(model, grade) {
        return (0, valuation_1.tradeInEstimate)(model, grade, await this.valuation());
    }
    async get(id) {
        const tradeIn = await this.prisma.tradeInDevice.findUnique({ where: { id } });
        return tradeIn ? this.view(tradeIn) : null;
    }
    async getOwned(id, customerId) {
        const tradeIn = await this.prisma.tradeInDevice.findFirst({ where: { id, customerId } });
        return tradeIn ? this.view(tradeIn) : null;
    }
    async listByCustomer(customerId) {
        const tradeIns = await this.prisma.tradeInDevice.findMany({
            where: { customerId },
            orderBy: { id: 'desc' },
            take: 100,
        });
        return tradeIns.map((tradeIn) => this.view(tradeIn));
    }
    async create(dto, actor, idempotencyKey, payout = false) {
        const key = idempotencyKey.trim();
        if (!key || key.length > 128) {
            throw new errors_1.ValidationError('invalid_idempotency_key', 'Idempotency key должен быть от 1 до 128 символов');
        }
        const model = dto.model.trim();
        const sellerPassport = dto.sellerPassport.trim();
        if (!model || !sellerPassport) {
            throw new errors_1.ValidationError('invalid_tradein_payload', 'Модель и паспорт продавца обязательны');
        }
        const customer = await this.prisma.customer.findUnique({
            where: { id: dto.customerId },
            select: { id: true },
        });
        if (!customer) {
            throw new errors_1.ValidationError('customer_not_found', `Клиент ${dto.customerId} не найден`);
        }
        const imei = this.cleanOptional(dto.imei);
        if (payout && (!Number.isInteger(dto.price) || (dto.price ?? 0) <= 0)) {
            throw new errors_1.ValidationError('invalid_tradein_price', 'Для приёмки сотрудником укажите положительную цену');
        }
        const price = payout
            ? dto.price
            : await this.estimate(model, dto.grade);
        if (!payout && price <= 0) {
            throw new errors_1.ValidationError('tradein_not_valued', 'Эту модель нельзя оценить онлайн — оформите выкуп в магазине, оценку сделает мастер.');
        }
        const input = { customerId: dto.customerId, model, imei, grade: dto.grade, price, sellerPassport };
        const existing = await this.prisma.tradeInDevice.findUnique({ where: { idempotencyKey: key } });
        if (existing)
            return this.replay(existing, input, payout);
        try {
            return await this.audit.transaction(async (tx) => {
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${`tradein:${key}`}))::text AS locked`;
                const replay = await tx.tradeInDevice.findUnique({ where: { idempotencyKey: key } });
                if (replay)
                    return { result: this.replay(replay, input, payout), events: [] };
                const tradeIn = await tx.tradeInDevice.create({
                    data: {
                        customerId: input.customerId,
                        model: input.model,
                        imei: input.imei,
                        grade: input.grade,
                        price: input.price,
                        sellerPassport: input.sellerPassport,
                        contractId: this.contractId(),
                        idempotencyKey: key,
                    },
                });
                const entry = payout ? await (0, accounting_journal_1.postAccountingEntryOnTx)(tx, {
                    idempotencyKey: `accounting:tradein.buyback:${tradeIn.id}`,
                    sourceType: 'tradein.buyback',
                    sourceRef: tradeIn.id,
                    description: `Выкуп ${tradeIn.model} по договору ${tradeIn.contractId}`,
                    documentAmount: tradeIn.price,
                    baseAmount: tradeIn.price,
                    occurredAt: new Date(),
                    createdBy: actor,
                    lines: [
                        { accountCode: inventory_valuation_1.INVENTORY_ASSET_ACCOUNT, debit: tradeIn.price, credit: 0, memo: 'Оприходование выкупленного устройства' },
                        { accountCode: '1000', debit: 0, credit: tradeIn.price, memo: 'Выплата клиенту за trade-in' },
                    ],
                }) : null;
                if (entry) {
                    await (0, cash_drawer_1.recordCashDrawerMovementOnTx)(tx, {
                        idempotencyKey: `drawer:tradein.buyback:${tradeIn.id}`,
                        staffId: actor,
                        amount: -tradeIn.price,
                        kind: 'tradein_buyback',
                        sourceType: 'tradein.buyback',
                        sourceRef: tradeIn.id,
                        reason: `Выкуп ${tradeIn.model}`,
                        createdBy: actor,
                        accountingEntryId: entry.id,
                    });
                }
                if (this.outbox) {
                    await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                        customerId: input.customerId,
                        template: 'tradein_decision',
                        payload: { tradeInId: tradeIn.id, contractId: tradeIn.contractId, price: tradeIn.price, model: tradeIn.model },
                        transactional: true,
                    });
                }
                return {
                    result: this.view(tradeIn),
                    events: [
                        {
                            type: event_types_1.EventType.TradeInAssessed,
                            actor,
                            payload: {
                                tradeInId: tradeIn.id,
                                customerId: input.customerId,
                                model: input.model,
                                imei: input.imei,
                                grade: input.grade,
                                price: input.price,
                            },
                            refs: this.refs(tradeIn.id, input.customerId, input.imei),
                        },
                        {
                            type: event_types_1.EventType.TradeInContracted,
                            actor,
                            payload: {
                                tradeInId: tradeIn.id,
                                customerId: input.customerId,
                                contractId: tradeIn.contractId,
                                imei: input.imei,
                            },
                            refs: this.refs(tradeIn.id, input.customerId, input.imei),
                        },
                    ],
                };
            });
        }
        catch (error) {
            if (isUniqueViolation(error)) {
                const raced = await this.prisma.tradeInDevice.findUniqueOrThrow({ where: { idempotencyKey: key } });
                return this.replay(raced, input, payout);
            }
            throw error;
        }
    }
    replay(tradeIn, input, comparePrice) {
        const matches = tradeIn.customerId === input.customerId &&
            tradeIn.model === input.model &&
            tradeIn.imei === input.imei &&
            tradeIn.grade === input.grade &&
            (!comparePrice || tradeIn.price === input.price) &&
            tradeIn.sellerPassport === input.sellerPassport;
        if (!matches)
            throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим trade-in');
        return this.view(tradeIn);
    }
    contractId() {
        const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const suffix = (0, node_crypto_1.randomBytes)(3).toString('hex').toUpperCase();
        return `TI-${day}-${suffix}`;
    }
    view(tradeIn) {
        return {
            id: tradeIn.id,
            customerId: tradeIn.customerId,
            model: tradeIn.model,
            imei: tradeIn.imei ?? null,
            grade: tradeIn.grade,
            price: tradeIn.price,
            contractId: tradeIn.contractId ?? null,
            sellerPassportMasked: this.maskPassport(tradeIn.sellerPassport),
        };
    }
    maskPassport(value) {
        if (value.length <= 4)
            return '*'.repeat(value.length);
        return `${value.slice(0, 3)}***${value.slice(-2)}`;
    }
    cleanOptional(value) {
        const clean = value?.trim();
        return clean ? clean : null;
    }
    refs(...values) {
        return values.filter((value) => Boolean(value));
    }
};
exports.TradeInsService = TradeInsService;
exports.TradeInsService = TradeInsService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        outbox_service_1.OutboxService,
        settings_service_1.SettingsService])
], TradeInsService);
function isUniqueViolation(error) {
    return (0, prisma_errors_1.isUniqueConstraintViolation)(error);
}
//# sourceMappingURL=tradeins.service.js.map