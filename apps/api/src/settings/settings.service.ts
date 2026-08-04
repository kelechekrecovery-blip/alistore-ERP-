import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import {
  SETTINGS,
  parseSettingValue,
  settingDefinition,
  type SettingDefinition,
} from './settings.registry';

export interface SettingView extends SettingDefinition {
  /** Effective value: the stored one, or the constant that was in force before. */
  value: number;
  /** False while the parameter still runs on its original hardcoded default. */
  overridden: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Effective value for one parameter. Falls back to the literal the code used
   * before, so an unset row behaves exactly like the old constant — and a broken
   * row never takes the shop down: an unparsable value is ignored in favour of
   * the fallback rather than throwing inside a sale.
   */
  async value(key: string): Promise<number> {
    const definition = settingDefinition(key);
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) return definition.fallback;
    try {
      return parseSettingValue(definition, row.value);
    } catch {
      return definition.fallback;
    }
  }

  /** Every parameter with its effective value — powers the settings screen. */
  async list(): Promise<SettingView[]> {
    const rows = await this.prisma.setting.findMany();
    const stored = new Map(rows.map((row) => [row.key, row]));
    return SETTINGS.map((definition) => {
      const row = stored.get(definition.key);
      let value = definition.fallback;
      if (row) {
        try {
          value = parseSettingValue(definition, row.value);
        } catch {
          value = definition.fallback;
        }
      }
      return {
        ...definition,
        value,
        overridden: Boolean(row),
        updatedBy: row?.updatedBy ?? null,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });
  }

  /**
   * Change a parameter. The previous value goes into the ledger next to the new
   * one, because "who raised the discount ceiling the week margin collapsed" is
   * exactly the question this table will be asked later.
   */
  async set(key: string, rawValue: string, actor: string): Promise<SettingView> {
    const definition = settingDefinition(key);
    const next = parseSettingValue(definition, rawValue);

    return this.audit.transaction(async (tx) => {
      const existing = await tx.setting.findUnique({ where: { key } });
      const previous = existing ? Number(existing.value) : definition.fallback;
      const row = await tx.setting.upsert({
        where: { key },
        create: { key, value: String(next), updatedBy: actor },
        update: { value: String(next), updatedBy: actor },
      });
      const result: SettingView = {
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
            type: EventType.SettingChanged,
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
}
