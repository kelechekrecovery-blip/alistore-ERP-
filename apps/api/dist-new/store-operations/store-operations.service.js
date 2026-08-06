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
exports.StoreOperationsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const prisma_service_1 = require("../prisma/prisma.service");
const store_point_identity_1 = require("../common/store-point-identity");
const CHECKLIST_TEMPLATE = {
    opening: [
        { code: 'front_open', label: 'Торговый зал открыт и проверен' },
        { code: 'cash_count', label: 'Стартовая касса пересчитана' },
        { code: 'terminal_online', label: 'Терминал и QR-оплата онлайн' },
        { code: 'scanner_ready', label: 'Сканер и принтер работают' },
        { code: 'cleanliness', label: 'Зал и зона выдачи подготовлены' },
        { code: 'safety_exit', label: 'Аварийный выход и безопасность проверены' },
    ],
    closing: [
        { code: 'cash_reconciled', label: 'Касса пересчитана и закрыта' },
        { code: 'terminal_batch_closed', label: 'Терминальная смена закрыта' },
        { code: 'stock_area_secured', label: 'Склад и витрины закрыты' },
        { code: 'returns_quarantined', label: 'Возвраты переданы в карантин' },
        { code: 'evidence_uploaded', label: 'Фото закрытия прикреплено' },
        { code: 'alarm_set', label: 'Охрана и сигнализация включены' },
    ],
};
function businessDate(value) {
    const date = value ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw new errors_1.ValidationError('store_business_date_invalid', 'Дата точки должна быть в формате YYYY-MM-DD');
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()))
        throw new errors_1.ValidationError('store_business_date_invalid', 'Дата точки некорректна');
    return parsed;
}
function commandKey(key) {
    if (!key?.trim())
        throw new errors_1.ValidationError('store_idempotency_required', 'Для операции точки нужен Idempotency-Key');
    return key.trim();
}
function fingerprint(input) {
    return JSON.stringify(input);
}
function serialise(value) {
    return JSON.parse(JSON.stringify(value));
}
let StoreOperationsService = class StoreOperationsService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async resolveReadablePoint(requested, user) {
        const staff = await this.prisma.staffUser.findUnique({
            where: { id: user.customerId },
            select: { point: true, role: true },
        });
        if (!staff)
            throw new errors_1.ForbiddenError('staff_not_found', 'Сотрудник не найден');
        const assignedPoint = await (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, staff.point, 'Точка сотрудника недоступна или отключена');
        if (staff.role === 'admin' || staff.role === 'owner') {
            return requested
                ? (await (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, requested)).inventoryLocation
                : undefined;
        }
        const requestedPoint = requested
            ? await (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, requested)
            : assignedPoint;
        if (requestedPoint.id !== assignedPoint.id) {
            throw new errors_1.ForbiddenError('store_point_mismatch', 'Доступны операции только своей точки');
        }
        return assignedPoint.inventoryLocation;
    }
    async resolveWritablePoint(requested, actor) {
        const staff = await this.prisma.staffUser.findUnique({
            where: { id: actor },
            select: { point: true, role: true, active: true },
        });
        if (!staff?.active)
            throw new errors_1.ForbiddenError('staff_not_found', 'Сотрудник не найден или отключён');
        const assigned = await (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, staff.point, 'Точка сотрудника недоступна или отключена');
        const selected = await (0, store_point_identity_1.resolveActiveStorePoint)(this.prisma, requested);
        if (staff.role !== 'admin' && staff.role !== 'owner' && selected.id !== assigned.id) {
            throw new errors_1.ForbiddenError('store_point_mismatch', 'Операции разрешены только в своей точке');
        }
        return selected.inventoryLocation;
    }
    async overview(query, user) {
        const date = businessDate(query.date);
        const point = await this.resolveReadablePoint(query.point?.trim() || undefined, user);
        const [checklists, incidents] = await Promise.all([
            this.prisma.storeOperationChecklist.findMany({
                where: { businessDate: date, ...(point ? { point } : {}) },
                include: { items: { orderBy: { id: 'asc' } } },
                orderBy: [{ point: 'asc' }, { type: 'asc' }],
            }),
            this.prisma.storeIncident.findMany({
                where: { businessDate: date, ...(point ? { point } : {}), ...(query.status ? { status: query.status } : {}) },
                orderBy: [{ status: 'asc' }, { severity: 'desc' }, { createdAt: 'desc' }],
                take: 100,
            }),
        ]);
        const openIncidents = incidents.filter((incident) => incident.status !== 'resolved').length;
        return {
            date: date.toISOString().slice(0, 10),
            point: point ?? null,
            checklists,
            incidents,
            summary: {
                checklists: checklists.length,
                completedChecklists: checklists.filter((item) => item.status === 'completed').length,
                openIncidents,
                criticalIncidents: incidents.filter((item) => item.severity === 'critical' && item.status !== 'resolved').length,
            },
        };
    }
    async createChecklist(dto, actor, rawKey) {
        const key = commandKey(rawKey);
        const point = await this.resolveWritablePoint(dto.point, actor);
        const date = businessDate(dto.businessDate);
        if (!point)
            throw new errors_1.ValidationError('store_point_required', 'Точка обязательна');
        const payload = { point, businessDate: date.toISOString(), type: dto.type };
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'store-command:' + key}))::text AS locked`;
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'store-checklist:' + point + ':' + date.toISOString() + ':' + dto.type}))::text AS locked`;
            const existingCommand = await tx.storeOperationCommand.findUnique({ where: { idempotencyKey: key } });
            const commandFingerprint = fingerprint(payload);
            if (existingCommand) {
                if (existingCommand.fingerprint !== commandFingerprint)
                    throw new errors_1.ConflictError('store_idempotency_conflict', 'Ключ уже использован для другой операции точки');
                return { result: existingCommand.response, events: [] };
            }
            const existing = await tx.storeOperationChecklist.findUnique({ where: { point_businessDate_type: { point, businessDate: date, type: dto.type } }, include: { items: true } });
            if (existing)
                throw new errors_1.ConflictError('store_checklist_exists', 'Чек-лист этого типа уже создан для точки и даты');
            const checklist = await tx.storeOperationChecklist.create({
                data: {
                    point, businessDate: date, type: dto.type, startedBy: actor, idempotencyKey: key,
                    items: { create: CHECKLIST_TEMPLATE[dto.type].map((item) => ({ ...item })) },
                },
                include: { items: { orderBy: { id: 'asc' } } },
            });
            const result = { ...checklist, idempotent: false };
            await tx.storeOperationCommand.create({ data: { idempotencyKey: key, resourceType: 'checklist.create', resourceId: checklist.id, fingerprint: commandFingerprint, response: serialise(result) } });
            return { result, events: [{ type: event_types_1.EventType.StoreChecklistCreated, actor, payload: { checklistId: checklist.id, point, businessDate: dto.businessDate, type: dto.type }, refs: [checklist.id, point] }] };
        });
    }
    async updateItem(checklistId, code, dto, actor, rawKey) {
        const key = commandKey(rawKey);
        const normalizedCode = code.trim();
        const payload = { checklistId, code: normalizedCode, checked: dto.checked, note: dto.note?.trim() || null };
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'store-command:' + key}))::text AS locked`;
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'store-checklist-item:' + checklistId + ':' + normalizedCode}))::text AS locked`;
            const existingCommand = await tx.storeOperationCommand.findUnique({ where: { idempotencyKey: key } });
            const commandFingerprint = fingerprint(payload);
            if (existingCommand) {
                if (existingCommand.fingerprint !== commandFingerprint)
                    throw new errors_1.ConflictError('store_idempotency_conflict', 'Ключ уже использован для другой операции точки');
                return { result: existingCommand.response, events: [] };
            }
            const checklist = await tx.storeOperationChecklist.findUnique({ where: { id: checklistId } });
            if (!checklist)
                throw new errors_1.ValidationError('store_checklist_not_found', 'Чек-лист не найден');
            if (checklist.status === 'completed')
                throw new errors_1.ConflictError('store_checklist_completed', 'Завершённый чек-лист нельзя изменять');
            const item = await tx.storeOperationChecklistItem.findUnique({ where: { checklistId_code: { checklistId, code: normalizedCode } } });
            if (!item)
                throw new errors_1.ValidationError('store_checklist_item_not_found', 'Пункт чек-листа не найден');
            const updated = await tx.storeOperationChecklistItem.update({ where: { id: item.id }, data: { checked: dto.checked, checkedBy: actor, checkedAt: dto.checked ? new Date() : null, note: dto.note?.trim() || null } });
            const result = { ...updated, idempotent: false };
            await tx.storeOperationCommand.create({ data: { idempotencyKey: key, resourceType: 'checklist.item', resourceId: item.id, fingerprint: commandFingerprint, response: serialise(result) } });
            return { result, events: [{ type: event_types_1.EventType.StoreChecklistItemChecked, actor, payload: { checklistId, itemId: item.id, code: item.code, checked: dto.checked }, refs: [checklistId, item.id] }] };
        });
    }
    async completeChecklist(checklistId, actor, rawKey) {
        const key = commandKey(rawKey);
        const payload = { checklistId };
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'store-command:' + key}))::text AS locked`;
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'store-checklist-complete:' + checklistId}))::text AS locked`;
            const existingCommand = await tx.storeOperationCommand.findUnique({ where: { idempotencyKey: key } });
            const commandFingerprint = fingerprint(payload);
            if (existingCommand) {
                if (existingCommand.fingerprint !== commandFingerprint)
                    throw new errors_1.ConflictError('store_idempotency_conflict', 'Ключ уже использован для другой операции точки');
                return { result: existingCommand.response, events: [] };
            }
            const checklist = await tx.storeOperationChecklist.findUnique({ where: { id: checklistId }, include: { items: true } });
            if (!checklist)
                throw new errors_1.ValidationError('store_checklist_not_found', 'Чек-лист не найден');
            if (checklist.status === 'completed')
                throw new errors_1.ConflictError('store_checklist_completed', 'Чек-лист уже завершён');
            const missing = checklist.items.filter((item) => item.required && !item.checked);
            if (missing.length)
                throw new errors_1.ValidationError('store_checklist_incomplete', `Не отмечены пункты: ${missing.map((item) => item.label).join(', ')}`);
            const updated = await tx.storeOperationChecklist.update({ where: { id: checklistId }, data: { status: 'completed', completedBy: actor, completedAt: new Date() }, include: { items: true } });
            const result = { ...updated, idempotent: false };
            await tx.storeOperationCommand.create({ data: { idempotencyKey: key, resourceType: 'checklist.complete', resourceId: checklistId, fingerprint: commandFingerprint, response: serialise(result) } });
            return { result, events: [{ type: event_types_1.EventType.StoreChecklistCompleted, actor, payload: { checklistId, point: checklist.point, type: checklist.type }, refs: [checklistId, checklist.point] }] };
        });
    }
    async createIncident(dto, actor, rawKey) {
        const key = commandKey(rawKey);
        const point = await this.resolveWritablePoint(dto.point, actor);
        const date = businessDate(dto.businessDate);
        const payload = { point, businessDate: date.toISOString(), category: dto.category.trim(), severity: dto.severity, title: dto.title.trim(), description: dto.description.trim() };
        if (!point || !payload.category || !payload.title || !payload.description)
            throw new errors_1.ValidationError('store_incident_fields_required', 'Точка, категория, заголовок и описание обязательны');
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'store-command:' + key}))::text AS locked`;
            const existingCommand = await tx.storeOperationCommand.findUnique({ where: { idempotencyKey: key } });
            const commandFingerprint = fingerprint(payload);
            if (existingCommand) {
                if (existingCommand.fingerprint !== commandFingerprint)
                    throw new errors_1.ConflictError('store_idempotency_conflict', 'Ключ уже использован для другой операции точки');
                return { result: existingCommand.response, events: [] };
            }
            const incident = await tx.storeIncident.create({ data: { ...payload, businessDate: date, createdBy: actor, idempotencyKey: key } });
            const result = { ...incident, idempotent: false };
            await tx.storeOperationCommand.create({ data: { idempotencyKey: key, resourceType: 'incident.create', resourceId: incident.id, fingerprint: commandFingerprint, response: serialise(result) } });
            return { result, events: [{ type: event_types_1.EventType.StoreIncidentCreated, actor, payload: { incidentId: incident.id, point, severity: dto.severity, category: payload.category }, refs: [incident.id, point] }] };
        });
    }
    async resolveIncident(id, dto, actor, rawKey) {
        const key = commandKey(rawKey);
        const resolution = dto.resolution.trim();
        if (!resolution)
            throw new errors_1.ValidationError('store_resolution_required', 'Укажите результат устранения инцидента');
        const payload = { id, resolution };
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'store-command:' + key}))::text AS locked`;
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'store-incident-resolve:' + id}))::text AS locked`;
            const existingCommand = await tx.storeOperationCommand.findUnique({ where: { idempotencyKey: key } });
            const commandFingerprint = fingerprint(payload);
            if (existingCommand) {
                if (existingCommand.fingerprint !== commandFingerprint)
                    throw new errors_1.ConflictError('store_idempotency_conflict', 'Ключ уже использован для другой операции точки');
                return { result: existingCommand.response, events: [] };
            }
            const incident = await tx.storeIncident.findUnique({ where: { id } });
            if (!incident)
                throw new errors_1.ValidationError('store_incident_not_found', 'Инцидент не найден');
            if (incident.status === client_1.StoreIncidentStatus.resolved)
                throw new errors_1.ConflictError('store_incident_resolved', 'Инцидент уже закрыт');
            const updated = await tx.storeIncident.update({ where: { id }, data: { status: 'resolved', resolution, resolvedBy: actor, resolvedAt: new Date() } });
            const result = { ...updated, idempotent: false };
            await tx.storeOperationCommand.create({ data: { idempotencyKey: key, resourceType: 'incident.resolve', resourceId: id, fingerprint: commandFingerprint, response: serialise(result) } });
            return { result, events: [{ type: event_types_1.EventType.StoreIncidentResolved, actor, payload: { incidentId: id, point: incident.point }, refs: [id, incident.point] }] };
        });
    }
};
exports.StoreOperationsService = StoreOperationsService;
exports.StoreOperationsService = StoreOperationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], StoreOperationsService);
//# sourceMappingURL=store-operations.service.js.map