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
exports.SettingsService = void 0;
const errors_1 = require("../common/errors");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const settings_registry_1 = require("./settings.registry");
let SettingsService = class SettingsService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async value(key) {
        const definition = (0, settings_registry_1.settingDefinition)(key);
        if ((0, settings_registry_1.isTextSetting)(definition)) {
            throw new errors_1.ValidationError('invalid_setting_value', `${definition.label}: читайте через text()`);
        }
        const row = await this.prisma.setting.findUnique({ where: { key } });
        if (!row)
            return Number(definition.fallback);
        try {
            return (0, settings_registry_1.parseSettingValue)(definition, row.value);
        }
        catch {
            console.warn(`[settings] значение ключа ${key} отброшено как невалидное, действует дефолт`);
            return Number(definition.fallback);
        }
    }
    async text(key) {
        const definition = (0, settings_registry_1.settingDefinition)(key);
        if (!(0, settings_registry_1.isTextSetting)(definition)) {
            throw new errors_1.ValidationError('invalid_setting_value', `${definition.label}: читайте через value()`);
        }
        const row = await this.prisma.setting.findUnique({ where: { key } });
        if (!row)
            return String(definition.fallback);
        try {
            return (0, settings_registry_1.parseSettingText)(definition, row.value);
        }
        catch {
            console.warn(`[settings] текст ключа ${key} отброшен как невалидный, действует дефолт`);
            return String(definition.fallback);
        }
    }
    async values(keys) {
        if (keys.length === 0)
            return {};
        const definitions = keys.map((key) => (0, settings_registry_1.settingDefinition)(key)).filter((d) => !(0, settings_registry_1.isTextSetting)(d));
        if (definitions.length === 0)
            return {};
        const rows = await this.prisma.setting.findMany({ where: { key: { in: [...keys] } } });
        const stored = new Map(rows.map((row) => [row.key, row.value]));
        return Object.fromEntries(definitions.map((definition) => {
            const raw = stored.get(definition.key);
            if (raw === undefined)
                return [definition.key, Number(definition.fallback)];
            try {
                return [definition.key, (0, settings_registry_1.parseSettingValue)(definition, raw)];
            }
            catch {
                return [definition.key, Number(definition.fallback)];
            }
        }));
    }
    async list() {
        const rows = await this.prisma.setting.findMany();
        const stored = new Map(rows.map((row) => [row.key, row]));
        return settings_registry_1.SETTINGS.map((definition) => {
            const row = stored.get(definition.key);
            let value = definition.fallback;
            let corrupted = false;
            if (row) {
                try {
                    value = (0, settings_registry_1.isTextSetting)(definition)
                        ? (0, settings_registry_1.parseSettingText)(definition, row.value)
                        : (0, settings_registry_1.parseSettingValue)(definition, row.value);
                }
                catch {
                    value = definition.fallback;
                    corrupted = true;
                    console.warn(`[settings] значение ключа ${definition.key} отброшено как невалидное`);
                }
            }
            return {
                ...definition,
                value,
                corrupted,
                overridden: Boolean(row),
                updatedBy: row?.updatedBy ?? null,
                updatedAt: row?.updatedAt.toISOString() ?? null,
            };
        });
    }
    async set(key, rawValue, actor) {
        const definition = (0, settings_registry_1.settingDefinition)(key);
        const next = (0, settings_registry_1.isTextSetting)(definition)
            ? (0, settings_registry_1.parseSettingText)(definition, rawValue)
            : (0, settings_registry_1.parseSettingValue)(definition, rawValue);
        return this.audit.transaction(async (tx) => {
            const existing = await tx.setting.findUnique({ where: { key } });
            const previous = existing
                ? ((0, settings_registry_1.isTextSetting)(definition) ? existing.value : Number(existing.value))
                : definition.fallback;
            const row = await tx.setting.upsert({
                where: { key },
                create: { key, value: String(next), updatedBy: actor },
                update: { value: String(next), updatedBy: actor },
            });
            const result = {
                ...definition,
                value: next,
                overridden: true,
                updatedBy: row.updatedBy,
                updatedAt: row.updatedAt.toISOString(),
            };
            return {
                result,
                events: [
                    {
                        type: event_types_1.EventType.SettingChanged,
                        actor,
                        payload: {
                            key,
                            label: definition.label,
                            from: previous,
                            to: next,
                            unit: definition.unit,
                            wasDefault: !existing,
                        },
                        refs: [key],
                    },
                ],
            };
        });
    }
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], SettingsService);
//# sourceMappingURL=settings.service.js.map