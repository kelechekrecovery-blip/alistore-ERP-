import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SETTINGS } from '../src/settings/settings.registry';
import { SettingsService } from '../src/settings/settings.service';

/**
 * Рычаг, который ничего не двигает, хуже отсутствующего.
 *
 * В реестре одиннадцать параметров, а `settings.value(` читал четыре — только
 * зарплатные. У остальных семи рядом жили жёсткие константы: порог согласования
 * скидки, порог изменения цены, минимальная маржа, лимит долга, ставка
 * начисления бонусов, срок гарантии и доля выкупа trade-in.
 *
 * При этом `PATCH /settings/:key` возвращал 200 и **писал событие в леджер** о
 * том, что значение изменено. Владелец получал подтверждение, что рычаг
 * сработал, а рантайм оставался прежним — и обнаружить это можно было только
 * по расхождению с реальностью через месяц.
 *
 * Этот тест не проверяет конкретные числа: он требует, чтобы каждый ключ
 * реестра кто-то читал. Проверка поведения живёт в спеках соответствующих
 * доменов — здесь важно, что ни один параметр не остался декоративным.
 */
describe('Настройки владельца · каждый ключ подключён', () => {
  let prisma: PrismaService;
  let settings: SettingsService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    settings = new SettingsService(prisma, new AuditService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('значение по умолчанию читается для каждого ключа реестра', async () => {
    for (const definition of SETTINGS) {
      const value = await settings.value(definition.key);
      expect({ key: definition.key, isNumber: Number.isFinite(value) })
        .toEqual({ key: definition.key, isNumber: true });
    }
  });

  /**
   * Ключевая проверка: значение из таблицы должно доходить до рантайма.
   *
   * Раньше `set` писал строку и событие, а поведение определяла константа рядом
   * с кодом. Тест ловит именно это — сохранённое значение обязано вернуться из
   * `value()`, а не подмениться дефолтом.
   */
  it('сохранённое владельцем значение возвращается вместо дефолта', async () => {
    for (const definition of SETTINGS) {
      const changed = definition.fallback + 1;
      await settings.set(definition.key, String(changed), 'owner-settings-test');
      expect({ key: definition.key, value: await settings.value(definition.key) })
        .toEqual({ key: definition.key, value: changed });
      await settings.set(definition.key, String(definition.fallback), 'owner-settings-test');
    }
  });

  /**
   * Барьер от повторения дефекта: каждый ключ реестра обязан читаться кодом.
   *
   * Список читающих мест собирается из исходников — так же, как правило четырёх
   * глаз собирает действия из реестра approvals. Ключ, добавленный в панель
   * владельца и не подключённый к рантайму, падает здесь, а не через месяц в
   * разговоре «почему лимит не изменился».
   */
  it('каждый ключ реестра кто-то читает', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(__dirname, '../src');
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith('.ts')) continue;
        if (entry.name.endsWith('.spec.ts')) continue;
        // Сам реестр объявляет ключи, а не читает их.
        if (full.endsWith('settings.registry.ts')) continue;
        sources.push(readFileSync(full, 'utf8'));
      }
    };
    walk(root);
    const haystack = sources.join('\n');

    const unread = SETTINGS
      .map((definition) => definition.key)
      .filter((key) => !haystack.includes(`'${key}'`))
      .sort();

    expect(unread).toEqual([]);
  });
});
