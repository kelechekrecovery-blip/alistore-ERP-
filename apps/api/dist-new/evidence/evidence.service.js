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
exports.EvidenceService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const client_1 = require("@prisma/client");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const media_service_1 = require("../media/media.service");
const media_cleanup_service_1 = require("../media/media-cleanup.service");
const prisma_service_1 = require("../prisma/prisma.service");
const authz_service_1 = require("../authz/authz.service");
const evidence_retention_policy_1 = require("./evidence-retention.policy");
let EvidenceService = class EvidenceService {
    constructor(prisma, audit, media, authz, mediaCleanup) {
        this.prisma = prisma;
        this.audit = audit;
        this.media = media;
        this.authz = authz;
        this.mediaCleanup = mediaCleanup;
    }
    async attachImage(input, dto, trustedStaffEvidence = false, idempotencyKey) {
        await this.assertEntityExists(dto.entityType, dto.entityId);
        const key = idempotencyKey?.trim() || undefined;
        if (key && key.length > 128) {
            throw new errors_1.ValidationError('idempotency_key_too_long', 'Idempotency-Key слишком длинный');
        }
        const label = dto.label?.trim() || null;
        const actor = dto.actor ?? 'system';
        const retention = (0, evidence_retention_policy_1.decideEvidenceRetention)(undefined, dto.entityType, label);
        const fingerprint = JSON.stringify({
            actor,
            entityType: dto.entityType,
            entityId: dto.entityId,
            label,
            trustedStaffEvidence,
            inputSha256: (0, node_crypto_1.createHash)('sha256').update(input).digest('hex'),
        });
        if (key) {
            const existing = await this.prisma.evidenceUpload.findUnique({ where: { idempotencyKey: key } });
            if (existing) {
                if (existing.fingerprint !== fingerprint) {
                    throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован для другого файла');
                }
                return {
                    entityType: existing.entityType,
                    entityId: existing.entityId,
                    asset: existing.asset,
                    label: existing.label,
                };
            }
        }
        const prefix = `evidence/${dto.entityType}/${dto.entityId}`;
        const prepared = await this.media.prepareImage(input);
        const objectKey = this.media.createImageKey(prefix);
        await this.mediaCleanup.registerIntent(objectKey);
        const asset = await this.media.storePreparedImage(prepared, prefix, objectKey);
        let replayed = false;
        try {
            const result = await this.audit.transaction(async (tx) => {
                if (key) {
                    await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${`evidence:${key}`}))`;
                    const existing = await tx.evidenceUpload.findUnique({ where: { idempotencyKey: key } });
                    if (existing) {
                        if (existing.fingerprint !== fingerprint) {
                            throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован для другого файла');
                        }
                        replayed = true;
                        const storedAsset = existing.asset;
                        return {
                            result: {
                                entityType: existing.entityType,
                                entityId: existing.entityId,
                                asset: { ...storedAsset, url: await this.media.getReadUrl(storedAsset.key) },
                                label: existing.label,
                            },
                            events: [],
                        };
                    }
                }
                if (trustedStaffEvidence && dto.entityType === 'exchange') {
                    await tx.$queryRaw `SELECT id FROM "ExchangeRequest" WHERE id = ${dto.entityId} FOR UPDATE`;
                    const request = await tx.exchangeRequest.findUnique({
                        where: { id: dto.entityId },
                        select: { requester: true, status: true, expiresAt: true },
                    });
                    if (!request
                        || request.status !== 'requested'
                        || request.expiresAt <= new Date()
                        || dto.actor !== `staff:${request.requester}`) {
                        throw new common_1.ForbiddenException('exchange_evidence_request_changed');
                    }
                }
                await this.mediaCleanup.markRetainedOnTx(tx, asset.key);
                if (key) {
                    await tx.evidenceUpload.create({
                        data: {
                            idempotencyKey: key,
                            actor,
                            entityType: dto.entityType,
                            entityId: dto.entityId,
                            label,
                            fingerprint,
                            asset: asset,
                            isPii: retention.isPii,
                            retentionUntil: retention.retentionUntil,
                        },
                    });
                }
                return {
                    result: { entityType: dto.entityType, entityId: dto.entityId, asset, label },
                    events: [
                        {
                            type: event_types_1.EventType.EvidenceAttached,
                            actor,
                            payload: {
                                entityType: dto.entityType,
                                entityId: dto.entityId,
                                label,
                                asset,
                                trustedStaffEvidence,
                            },
                            refs: [dto.entityId, asset.key],
                        },
                    ],
                };
            });
            if (replayed)
                await this.mediaCleanup.deleteOrSchedule(asset.key);
            return replayed
                ? { ...result, asset: { ...result.asset, url: await this.media.getReadUrl(result.asset.key) } }
                : result;
        }
        catch (error) {
            await this.mediaCleanup.deleteOrSchedule(asset.key);
            throw error;
        }
    }
    async findUpload(idempotencyKey) {
        const upload = await this.prisma.evidenceUpload.findUnique({ where: { idempotencyKey } });
        if (!upload)
            throw new errors_1.ValidationError('evidence_not_found', 'Evidence-файл не найден');
        return upload;
    }
    async assertStaffCanRead(role) {
        if (!(await this.authz.can(role, 'evidence', 'read'))) {
            throw new common_1.ForbiddenException('evidence_read_permission_denied');
        }
    }
    async assertStaffCanAttachOrder(staffId, role, orderId) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { courierId: true },
        });
        if (!order)
            throw new errors_1.ValidationError('evidence_entity_not_found', `order ${orderId} не найден`);
        if (role === 'courier' && order.courierId !== staffId) {
            throw new common_1.NotFoundException('order_evidence_not_found');
        }
    }
    async assertCourierOrderEvidence(idempotencyKey, courierId, orderId, label) {
        const key = idempotencyKey?.trim();
        if (!key)
            throw new errors_1.ValidationError('courier_evidence_required', 'Для операции требуется фото Evidence');
        const upload = await this.prisma.evidenceUpload.findUnique({
            where: { idempotencyKey: key },
            select: {
                actor: true,
                entityType: true,
                entityId: true,
                label: true,
                purgedAt: true,
            },
        });
        if (!upload
            || upload.purgedAt
            || upload.actor !== `staff:${courierId}`
            || upload.entityType !== 'order'
            || upload.entityId !== orderId
            || upload.label !== label) {
            throw new errors_1.ValidationError('courier_evidence_mismatch', 'Evidence не принадлежит этой доставке');
        }
    }
    async issueRead(idempotencyKey, actor) {
        const upload = await this.findUpload(idempotencyKey);
        if (upload.purgedAt) {
            throw new errors_1.ValidationError('evidence_purged', 'Срок хранения Evidence истёк');
        }
        const storedAsset = upload.asset;
        const asset = { ...storedAsset, url: await this.media.getReadUrl(storedAsset.key) };
        return this.audit.transaction(async () => ({
            result: {
                entityType: upload.entityType,
                entityId: upload.entityId,
                asset,
                label: upload.label,
            },
            events: [
                {
                    type: event_types_1.EventType.EvidenceAccessed,
                    actor,
                    payload: { entityType: upload.entityType, entityId: upload.entityId, assetKey: storedAsset.key },
                    refs: [upload.entityId, storedAsset.key, upload.idempotencyKey],
                },
            ],
        }));
    }
    async assertStaffCanAttachLoanerCustody(staffId, loanId) {
        const [staff, loan] = await Promise.all([
            this.prisma.staffUser.findUnique({ where: { id: staffId }, select: { active: true, role: true, point: true } }),
            this.prisma.loanerLoan.findUnique({ where: { id: loanId }, select: { workOrder: { select: { point: true } } } }),
        ]);
        if (!staff?.active || !(await this.authz.can(staff.role, 'service_center', 'loaners_issue'))) {
            throw new common_1.ForbiddenException('loaner_evidence_permission_denied');
        }
        if (!loan)
            throw new errors_1.ValidationError('evidence_entity_not_found', `loaner ${loanId} не найден`);
        if (!['admin', 'owner'].includes(staff.role) && staff.point !== loan.workOrder.point) {
            throw new common_1.ForbiddenException('loaner_evidence_point_mismatch');
        }
    }
    async assertStaffCanAttachExchange(staffId, exchangeRequestId) {
        const request = await this.prisma.exchangeRequest.findUnique({
            where: { id: exchangeRequestId },
            select: { requester: true, status: true, expiresAt: true },
        });
        if (!request) {
            throw new errors_1.ValidationError('evidence_entity_not_found', `exchange ${exchangeRequestId} не найден`);
        }
        if (request.status !== 'requested' || request.expiresAt <= new Date()) {
            throw new common_1.ForbiddenException('exchange_evidence_request_resolved');
        }
        if (request.requester !== staffId) {
            throw new common_1.ForbiddenException('exchange_evidence_requester_mismatch');
        }
    }
    async assertCustomerOwnsEntity(customerId, type, id) {
        let ownerId = null;
        switch (type) {
            case 'tradein':
                ownerId = (await this.prisma.tradeInDevice.findUnique({ where: { id }, select: { customerId: true } }))?.customerId ?? null;
                break;
            case 'warranty':
                ownerId = (await this.prisma.warrantyCase.findUnique({ where: { id }, select: { customerId: true } }))?.customerId ?? null;
                break;
            case 'support':
                ownerId = (await this.prisma.supportTicket.findUnique({ where: { id }, select: { customerId: true } }))?.customerId ?? null;
                break;
            case 'order':
                ownerId = (await this.prisma.order.findUnique({ where: { id }, select: { customerId: true } }))?.customerId ?? null;
                break;
            case 'loaner':
                ownerId = (await this.prisma.loanerLoan.findUnique({ where: { id }, select: { customerId: true } }))?.customerId ?? null;
                break;
            case 'return': {
                const item = await this.prisma.return.findUnique({ where: { id }, select: { orderId: true } });
                ownerId = item
                    ? (await this.prisma.order.findUnique({ where: { id: item.orderId }, select: { customerId: true } }))?.customerId ?? null
                    : null;
                break;
            }
            case 'inventory':
            case 'shift':
            case 'quarantine':
            case 'exchange':
                throw new common_1.ForbiddenException('evidence_staff_only_entity');
        }
        if (!ownerId)
            throw new errors_1.ValidationError('evidence_entity_not_found', `${type} ${id} не найден`);
        if (ownerId !== customerId)
            throw new common_1.ForbiddenException('evidence_owner_mismatch');
    }
    async assertStaffCanAttachShift(staffId, role, shiftId) {
        const shift = await this.prisma.cashShift.findUnique({
            where: { id: shiftId },
            select: { staffId: true },
        });
        const manager = role === client_1.Role.owner || role === client_1.Role.admin;
        if (!shift || (shift.staffId !== staffId && !manager)) {
            throw new common_1.NotFoundException('Сущность Evidence не найдена');
        }
    }
    async assertEntityExists(type, id) {
        const found = await this.lookup(type, id);
        if (!found) {
            throw new errors_1.ValidationError('evidence_entity_not_found', `${type} ${id} не найден`);
        }
    }
    lookup(type, id) {
        switch (type) {
            case 'tradein':
                return this.prisma.tradeInDevice.findUnique({ where: { id } });
            case 'return':
                return this.prisma.return.findUnique({ where: { id } });
            case 'warranty':
                return this.prisma.warrantyCase.findUnique({ where: { id } });
            case 'inventory':
                return this.prisma.inventoryMovement.findUnique({ where: { id } });
            case 'order':
                return this.prisma.order.findUnique({ where: { id } });
            case 'support':
                return this.prisma.supportTicket.findUnique({ where: { id } });
            case 'shift':
                return this.prisma.cashShift.findUnique({ where: { id } });
            case 'loaner':
                return this.prisma.loanerLoan.findUnique({ where: { id } });
            case 'quarantine':
                return this.prisma.inventoryQuarantineCase.findUnique({ where: { id } });
            case 'exchange':
                return this.prisma.exchangeRequest.findUnique({ where: { id } });
        }
    }
};
exports.EvidenceService = EvidenceService;
exports.EvidenceService = EvidenceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        media_service_1.MediaService,
        authz_service_1.AuthzService,
        media_cleanup_service_1.MediaCleanupService])
], EvidenceService);
//# sourceMappingURL=evidence.service.js.map