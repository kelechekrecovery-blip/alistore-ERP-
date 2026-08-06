import { ValidationError } from '../common/errors';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import {
  SETTINGS,
  parseSettingValue,
  settingDefinition,
  type SettingDefinition,
  isTextSetting,
  parseSettingText,
} from './settings.registry';

export interface SettingView extends SettingDefinition {
  /**
   * Сохранённое значение существует, но больше не проходит проверку.
   *
   * Без этого флага экран показывал чип «изменён» и подпись «изменил Алиса»
   * рядом с дефолтом: владелец видел чужую фамилию и дату у значения, которое
   * в действительности отброшено и нигде не применяется. Молчание здесь дороже
   * тревоги — по такому параметру считают деньги.
   */
  corrupted?: boolean;
  /**
   * Effective value: the stored one, or the constant that was in force before.
   *
   * Строка у ссылочных параметров (`kind: 'url'`) — экран настроек рисует их
   * загрузкой файла, а не полем ввода числа.
   */
  value: number | string;
  /** False while the parameter still runs on its original hardcoded default. */
  overridden: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

@Injectable()
export class SettingsService {
  /**
   * Кэш прочитанных значений.
   *
   * Каталог читает 17 ключей на КАЖДЫЙ запрос — два похода в базу там, где
   * значения меняются раз в месяц. Инвалидация явная, в `set()`: владелец
   * поменял наценку и тут же видит её на витрине, без ожидания TTL.
   *
   * TTL — только подстраховка на случай, если значение изменят мимо `set()`
   * (миграцией, вручную в базе). Он не основной механизм.
   *
   * Безопасность проверена отдельно: транзакционный путь заказа читает
   * `loyalty.earn_rate_bps` своим запросом в момент проведения, не отсюда, —
   * начисление не может разойтись с тем, что показано на витрине по кэшу.
   */
  private static readonly CACHE_TTL_MS = 30_000;
  private cache = new Map<string, { value: number | string; expiresAt: number }>();

  private cached(key: string): number | string | undefined {
    const hit = this.cache.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return hit.value;
  }

  private remember(key: string, value: number | string): void {
    this.cache.set(key, { value, expiresAt: Date.now() + SettingsService.CACHE_TTL_MS });
  }

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
    // Числовой контракт остаётся числовым: ссылочный параметр сюда попадать не
    // должен, иначе расчёт молча получит NaN вместо внятной ошибки.
    if (isTextSetting(definition)) {
      throw new ValidationError('invalid_setting_value', `${definition.label}: читайте через text()`);
    }
    const hit = this.cached(key);
    if (typeof hit === 'number') return hit;
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) {
      const fallback = Number(definition.fallback);
      this.remember(key, fallback);
      return fallback;
    }
    try {
      const parsed = parseSettingValue(definition, row.value);
      this.remember(key, parsed);
      return parsed;
    } catch {
      console.warn(`[settings] значение ключа ${key} отброшено как невалидное, действует дефолт`);
      return Number(definition.fallback);
    }
  }

  /**
   * Ссылочный параметр — QR провайдера рассрочки.
   *
   * Пустая строка честнее подстановки: она означает «владелец ещё не поставил»,
   * и витрина по ней просто не показывает блок. Битое значение тоже даёт пустоту,
   * а не роняет страницу товара.
   */
  async text(key: string): Promise<string> {
    const definition = settingDefinition(key);
    if (!isTextSetting(definition)) {
      throw new ValidationError('invalid_setting_value', `${definition.label}: читайте через value()`);
    }
    // Ссылочные и текстовые параметры НЕ кэшируем намеренно.
    //
    // Выигрыш от кэша дал числовой блок: 12 ключей рассрочки читаются одним
    // запросом на каждое обращение к каталогу. Документы и QR читаются при
    // рендере страницы и Prisma склеивает их в один запрос — экономии почти
    // нет, а цена высока: значение, изменённое мимо `set()` (миграцией, SQL,
    // тестом), продолжало бы отдаваться старым, и «я опубликовал оферту, а её
    // нет» стало бы загадкой на полминуты.
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) return String(definition.fallback);
    try {
      return parseSettingText(definition, row.value);
    } catch {
      console.warn(`[settings] текст ключа ${key} отброшен как невалидный, действует дефолт`);
      return String(definition.fallback);
    }
  }

  /** Read a group of effective values in one query for request-time consumers. */
  async values(keys: readonly string[]): Promise<Record<string, number>> {
    if (keys.length === 0) return {};
    const definitions = keys.map((key) => settingDefinition(key)).filter((d) => !isTextSetting(d));
    if (definitions.length === 0) return {};
    const rows = await this.prisma.setting.findMany({ where: { key: { in: [...keys] } } });
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    return Object.fromEntries(definitions.map((definition) => {
      const raw = stored.get(definition.key);
      if (raw === undefined) return [definition.key, Number(definition.fallback)];
      try {
        return [definition.key, parseSettingValue(definition, raw)];
      } catch {
        return [definition.key, Number(definition.fallback)];
      }
    }));
  }

  /** Every parameter with its effective value — powers the settings screen. */
  async list(): Promise<SettingView[]> {
    const rows = await this.prisma.setting.findMany();
    const stored = new Map(rows.map((row) => [row.key, row]));
    return SETTINGS.map((definition) => {
      const row = stored.get(definition.key);
      let value: number | string = definition.fallback;
      let corrupted = false;
      if (row) {
        try {
          value = isTextSetting(definition)
            ? parseSettingText(definition, row.value)
            : parseSettingValue(definition, row.value);
        } catch {
          // Сохранённое значение больше не проходит проверку — например,
          // владелец сузил допустимый диапазон уже после записи. Возвращаем
          // дефолт (иначе экран настроек падал бы целиком), но говорим об этом
          // вслух: и в ответе, и в логе.
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

  /**
   * Change a parameter. The previous value goes into the ledger next to the new
   * one, because "who raised the discount ceiling the week margin collapsed" is
   * exactly the question this table will be asked later.
   */
  async set(key: string, rawValue: string, actor: string): Promise<SettingView> {
    const definition = settingDefinition(key);
    const next: number | string = isTextSetting(definition)
      ? parseSettingText(definition, rawValue)
      : parseSettingValue(definition, rawValue);
    // Кэш чистим сразу: владелец, поменявший наценку, обязан увидеть её на
    // витрине следующим же запросом, а не через TTL.
    this.cache.delete(key);

    return this.audit.transaction(async (tx) => {
      const existing = await tx.setting.findUnique({ where: { key } });
      const previous = existing
        ? (isTextSetting(definition) ? existing.value : Number(existing.value))
        : definition.fallback;
      const row = await tx.setting.upsert({
        where: { key },
        create: { key, value: String(next), updatedBy: actor },
        update: { value: String(next), updatedBy: actor },
      });
      this.cache.delete(key);
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
